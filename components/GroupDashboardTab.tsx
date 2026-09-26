'use client'
import { weekStart, addDays, runDay } from '@/lib/calendar'
import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Trophy, Plus, X, Shield, ShieldOff, UserMinus } from 'lucide-react'
import { speedToPace, paceUnitLabel, distanceUnitLabel, metersToMiles } from '@/lib/utils'
import { getBestChallengeEffort } from '@/lib/challengeUtils'
import { TIERS, tierNumber } from '@/lib/rhythm'
import WeaponSprite from '@/components/WeaponSprite'
import { useUnit } from '@/lib/unit-context'
import { Avatar, RunTypeDot, type Group, type Member, type LeaderboardRun, type Challenge, type TrainingLoad, type MemberRhythm, formatTime } from '@/components/GroupShared'
import GroupCoachTab from '@/components/GroupCoachTab'
import GroupMessageBoard from '@/components/GroupMessageBoard'
import type { BriefingContent } from '@/app/api/groups/[id]/coach/briefing/route'

interface BriefingMeta {
  cached: boolean
  generated_at: string
}

interface Props {
  group: Group
  leaderboardRuns: LeaderboardRun[]
  members: Member[]
  memberTrainingLoads: Record<number, TrainingLoad>
  myRole: string
  myAthleteId: number
  initialChallenges: Challenge[]
  onKickMember: (athleteId: number) => Promise<void>
  onUpdateMemberRole: (athleteId: number, role: 'admin' | 'member') => Promise<void>
  initialBriefing?: BriefingContent | null
  initialBriefingMeta?: BriefingMeta | null
  /** Rhythm weapon tiers for the leaderboard; null while Rhythm is off. */
  memberRhythm: MemberRhythm | null
  /** The viewer's local date. Runs count on the local date they were run. */
  today: string
}

// ── Leaderboard helpers ──────────────────────────────────────────────────────

type LeaderRange = 'week' | 'month' | 'ytd' | '6m'
type ChallengeType = 'group_distance' | 'weekly_quota' | 'fastest_effort' | 'elevation' | 'run_count'

function getRangeStart(range: LeaderRange, today: string): string {
  return range === 'week' ? weekStart(today)
    : range === 'month' ? today.slice(0, 7) + '-01'
    : range === 'ytd' ? today.slice(0, 4) + '-01-01'
    : addDays(today, -182)
}

function computeLeaderboard(runs: LeaderboardRun[], range: LeaderRange, members: Member[], today: string, rhythm: MemberRhythm | null) {
  const cutoff = getRangeStart(range, today)
  const filtered = runs.filter(r => runDay(r) >= cutoff)
  const totals: Record<number, { distance: number; count: number }> = {}
  for (const r of filtered) {
    if (!totals[r.athlete_id]) totals[r.athlete_id] = { distance: 0, count: 0 }
    totals[r.athlete_id].distance += r.distance
    totals[r.athlete_id].count += r.source_count ?? 1
  }
  return members
    .map(m => ({
      athlete_id: m.athlete_id,
      name: m.name,
      profile_pic: m.profile_pic,
      is_me: m.is_me,
      distance: totals[m.athlete_id]?.distance ?? 0,
      count: totals[m.athlete_id]?.count ?? 0,
      tier: TIERS.find(t => t.key === rhythm?.tiers[m.athlete_id]) ?? null,
    }))
    .sort((a, b) => b.distance - a.distance)
}

// ── Challenge helpers ────────────────────────────────────────────────────────

function challengeStatus(c: Challenge, today: string): 'active' | 'upcoming' | 'past' {
  if (today < c.start_date) return 'upcoming'
  if (today > c.end_date) return 'past'
  return 'active'
}

/** Challenge dates are inclusive local dates. */
function inChallenge(r: LeaderboardRun, c: Challenge) {
  const day = runDay(r)
  return day >= c.start_date && day <= c.end_date
}

function computeChallengeProgress(
  leaderboardRuns: LeaderboardRun[],
  challenge: Challenge,
  members: Member[],
) {
  const relevant = leaderboardRuns.filter(r => inChallenge(r, challenge))
  const totalMeters = relevant.reduce((sum, r) => sum + r.distance, 0)
  const byMember = members.map(m => ({
    athlete_id: m.athlete_id,
    name: m.name,
    profile_pic: m.profile_pic,
    is_me: m.is_me,
    meters: relevant.filter(r => r.athlete_id === m.athlete_id).reduce((sum, r) => sum + r.distance, 0),
  })).sort((a, b) => b.meters - a.meters)
  return { totalMeters, byMember }
}

function computeWeeklyQuota(
  leaderboardRuns: LeaderboardRun[],
  challenge: Challenge,
  members: Member[],
) {
  const weeklyMeters = (challenge.config.weekly_meters as number) ?? 0

  // Monday-start local weeks overlapping the challenge.
  const weeks: string[] = []
  for (let week = weekStart(challenge.start_date); week <= challenge.end_date; week = addDays(week, 7)) weeks.push(week)

  const byMember = members.map(m => {
    const memberRuns = leaderboardRuns.filter(r => r.athlete_id === m.athlete_id && inChallenge(r, challenge))
    const weekResults = weeks.map(ws => {
      const we = addDays(ws, 7)
      const total = memberRuns
        .filter(r => {
          const day = runDay(r)
          return day >= ws && day < we
        })
        .reduce((sum, r) => sum + r.distance, 0)
      return total >= weeklyMeters
    })
    return { athlete_id: m.athlete_id, name: m.name, profile_pic: m.profile_pic, is_me: m.is_me, weekResults }
  })

  return { weeks, byMember }
}

function computeFastestEffort(
  leaderboardRuns: LeaderboardRun[],
  challenge: Challenge,
  members: Member[],
) {
  const relevant = leaderboardRuns.filter(r => inChallenge(r, challenge))

  const byMember = members.map(m => {
    const memberRuns = relevant.filter(r => r.athlete_id === m.athlete_id)
    const bestEffort = memberRuns.reduce<ReturnType<typeof getBestChallengeEffort>>((best, run) => {
      const effort = getBestChallengeEffort(run)
      if (!effort) return best
      if (!best || effort.averageSpeed > best.averageSpeed) return effort
      return best
    }, null)
    return { athlete_id: m.athlete_id, name: m.name, profile_pic: m.profile_pic, is_me: m.is_me, bestEffort }
  }).sort((a, b) => {
    if (a.bestEffort === null && b.bestEffort === null) return 0
    if (a.bestEffort === null) return 1
    if (b.bestEffort === null) return -1
    return b.bestEffort.averageSpeed - a.bestEffort.averageSpeed
  })

  return { byMember }
}

function computeElevationProgress(
  leaderboardRuns: LeaderboardRun[],
  challenge: Challenge,
  members: Member[],
) {
  const relevant = leaderboardRuns.filter(r => inChallenge(r, challenge))
  const totalElevation = relevant.reduce((sum, r) => sum + (r.total_elevation_gain ?? 0), 0)
  const byMember = members.map(m => ({
    athlete_id: m.athlete_id,
    name: m.name,
    profile_pic: m.profile_pic,
    is_me: m.is_me,
    elevation: relevant.filter(r => r.athlete_id === m.athlete_id).reduce((sum, r) => sum + (r.total_elevation_gain ?? 0), 0),
  })).sort((a, b) => b.elevation - a.elevation)
  return { totalElevation, byMember }
}

function computeRunCountProgress(
  leaderboardRuns: LeaderboardRun[],
  challenge: Challenge,
  members: Member[],
) {
  const relevant = leaderboardRuns.filter(r => inChallenge(r, challenge))
  const byMember = members.map(m => ({
    athlete_id: m.athlete_id,
    name: m.name,
    profile_pic: m.profile_pic,
    is_me: m.is_me,
    count: relevant.filter(r => r.athlete_id === m.athlete_id).reduce((n,r)=>n+(r.source_count??1),0),
  })).sort((a, b) => b.count - a.count)
  return { totalCount: relevant.reduce((n,r)=>n+(r.source_count??1),0), byMember }
}

function getLastMonthRange(today: string) {
  const thisMonth = today.slice(0, 7) + '-01'
  return { start: addDays(thisMonth, -1).slice(0, 7) + '-01', end: addDays(thisMonth, -1) }
}

function summarizePastChallenge(
  challenge: Challenge,
  leaderboardRuns: LeaderboardRun[],
  members: Member[],
  unit: 'miles' | 'km',
) {
  const toDisplay = (m: number) => unit === 'miles' ? metersToMiles(m) : m / 1000
  const distanceLabel = distanceUnitLabel(unit)
  const cType = challenge.challenge_type ?? 'group_distance'
  const target = challenge.target_meters ?? 0

  if (cType === 'group_distance') {
    const { totalMeters, byMember } = computeChallengeProgress(leaderboardRuns, challenge, members)
    const leader = byMember[0]
    return {
      achieved: target > 0 && totalMeters >= target,
      resultStr: `${toDisplay(totalMeters).toFixed(1)} ${distanceLabel}${target > 0 ? ` / ${toDisplay(target).toFixed(0)} ${distanceLabel}` : ''}`,
      winnerLabel: leader ? `${leader.is_me ? 'You' : leader.name.split(' ')[0]} led with ${toDisplay(leader.meters).toFixed(1)} ${distanceLabel}` : null,
    }
  }

  if (cType === 'weekly_quota') {
    const { weeks, byMember } = computeWeeklyQuota(leaderboardRuns, challenge, members)
    const totalWeeks = weeks.length
    const standings = byMember
      .map(m => ({
        ...m,
        hitCount: m.weekResults.filter(Boolean).length,
      }))
      .sort((a, b) => b.hitCount - a.hitCount)
    const leader = standings[0]
    const achieved = totalWeeks > 0 && standings.length > 0 && standings.every(m => m.hitCount === totalWeeks)
    return {
      achieved,
      resultStr: `${standings.filter(m => m.hitCount === totalWeeks).length}/${standings.length} members completed all ${totalWeeks} weeks`,
      winnerLabel: leader ? `${leader.is_me ? 'You' : leader.name.split(' ')[0]} topped it at ${leader.hitCount}/${totalWeeks} weeks` : null,
    }
  }

  if (cType === 'elevation') {
    const { totalElevation, byMember } = computeElevationProgress(leaderboardRuns, challenge, members)
    const leader = byMember[0]
    return {
      achieved: target > 0 && totalElevation >= target,
      resultStr: `${Math.round(totalElevation)}m${target > 0 ? ` / ${Math.round(target)}m` : ''}`,
      winnerLabel: leader ? `${leader.is_me ? 'You' : leader.name.split(' ')[0]} led with ${Math.round(leader.elevation)}m` : null,
    }
  }

  if (cType === 'run_count') {
    const { totalCount, byMember } = computeRunCountProgress(leaderboardRuns, challenge, members)
    const leader = byMember[0]
    return {
      achieved: target > 0 && totalCount >= target,
      resultStr: `${totalCount}${target > 0 ? ` / ${target}` : ''} runs`,
      winnerLabel: leader ? `${leader.is_me ? 'You' : leader.name.split(' ')[0]} logged ${leader.count} runs` : null,
    }
  }

  if (cType === 'fastest_effort') {
    const { byMember } = computeFastestEffort(leaderboardRuns, challenge, members)
    const winner = byMember.find(m => m.bestEffort)
    return {
      achieved: false,
      resultStr: winner?.bestEffort
        ? `${speedToPace(winner.bestEffort.averageSpeed, unit)}${paceUnitLabel(unit)}`
        : 'No valid laps or 1 km splits',
      winnerLabel: winner?.bestEffort
        ? `${winner.is_me ? 'You' : winner.name.split(' ')[0]} won with the fastest effort`
        : null,
    }
  }

  return { achieved: false, resultStr: '', winnerLabel: null as string | null }
}

export default function GroupDashboardTab({
  group, leaderboardRuns, members, memberTrainingLoads, myRole, myAthleteId, initialChallenges,
  onKickMember, onUpdateMemberRole, initialBriefing, initialBriefingMeta, memberRhythm, today,
}: Props) {
  const { unit } = useUnit()
  const label = distanceUnitLabel(unit)
  const toDisplay = (m: number) => unit === 'miles' ? metersToMiles(m) : m / 1000

  // Leaderboard
  const [leaderRange, setLeaderRange] = useState<LeaderRange>('week')

  // Challenges
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges)
  const [showCreate, setShowCreate] = useState(false)
  const [challengeType, setChallengeType] = useState<ChallengeType>('group_distance')
  const [form, setForm] = useState({ name: '', description: '', targetDist: '', startDate: '', endDate: '' })
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null)
  const [editType, setEditType] = useState<ChallengeType>('group_distance')
  const [editForm, setEditForm] = useState({ name: '', description: '', targetDist: '', startDate: '', endDate: '' })
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const board = computeLeaderboard(leaderboardRuns, leaderRange, members, today, memberRhythm)
  const maxDist = Math.max(...board.map(e => e.distance), 1)
  const ranges: { key: LeaderRange; label: string }[] = [
    { key: 'week',  label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'ytd',   label: 'Year to Date' },
    { key: '6m',    label: 'Last 6 Months' },
  ]

  const active   = challenges.filter(c => challengeStatus(c, today) === 'active')
  const upcoming = challenges.filter(c => challengeStatus(c, today) === 'upcoming')
  const past     = challenges.filter(c => challengeStatus(c, today) === 'past')
  const lastMonthRange = getLastMonthRange(today)
  const lastMonthChallenge = [...past]
    .filter(c => c.end_date >= lastMonthRange.start && c.end_date <= lastMonthRange.end)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
  const lastMonthSummary = lastMonthChallenge
    ? summarizePastChallenge(lastMonthChallenge, leaderboardRuns, members, unit)
    : null

  async function createChallenge() {
    setFormError('')
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      setFormError('Please fill in all required fields.')
      return
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setFormError('End date must be after start date.')
      return
    }

    let target_meters: number | null = null
    let config: Record<string, unknown> = {}

    if (challengeType === 'group_distance') {
      const dist = parseFloat(form.targetDist)
      if (isNaN(dist) || dist <= 0) { setFormError('Please enter a valid target distance.'); return }
      target_meters = unit === 'miles' ? dist * 1609.344 : dist * 1000
    } else if (challengeType === 'weekly_quota') {
      const dist = parseFloat(form.targetDist)
      if (isNaN(dist) || dist <= 0) { setFormError('Please enter a valid weekly quota.'); return }
      target_meters = unit === 'miles' ? dist * 1609.344 : dist * 1000
      config = { weekly_meters: target_meters }
    } else if (challengeType === 'elevation') {
      const m = parseFloat(form.targetDist)
      if (isNaN(m) || m <= 0) { setFormError('Please enter a valid elevation target.'); return }
      target_meters = m // stored raw in meters
    } else if (challengeType === 'run_count') {
      const n = parseInt(form.targetDist)
      if (isNaN(n) || n <= 0) { setFormError('Please enter a valid run count.'); return }
      target_meters = n // stored as count
    }

    setFormSaving(true)
    const res = await fetch(`/api/groups/${group.id}/challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        target_meters,
        start_date: form.startDate,
        end_date: form.endDate,
        challenge_type: challengeType,
        config,
      }),
    })
    const data = await res.json()
    setFormSaving(false)
    if (!res.ok) { setFormError(data.error ?? 'Failed to create challenge.'); return }
    setChallenges(prev => [data, ...prev])
    setShowCreate(false)
    setForm({ name: '', description: '', targetDist: '', startDate: '', endDate: '' })
    setChallengeType('group_distance')
  }

  async function deleteChallenge(id: string) {
    if (!confirm('Delete this challenge?')) return
    const res = await fetch(`/api/groups/${group.id}/challenges?challengeId=${id}`, { method: 'DELETE' })
    if (res.ok) setChallenges(prev => prev.filter(c => c.id !== id))
  }

  function openEdit(c: Challenge) {
    const cType = (c.challenge_type ?? 'group_distance') as ChallengeType
    setEditType(cType)
    const rawTarget = c.target_meters ?? (cType === 'weekly_quota' ? (c.config['weekly_meters'] as number | undefined) : undefined)
    let targetDist = ''
    if (rawTarget != null) {
      if (cType === 'group_distance' || cType === 'weekly_quota') {
        targetDist = String(unit === 'miles' ? Math.round(metersToMiles(rawTarget) * 10) / 10 : Math.round(rawTarget / 100) / 10)
      } else {
        // elevation (meters) or run_count (integer) — stored raw
        targetDist = String(Math.round(rawTarget))
      }
    }
    setEditForm({
      name: c.name,
      description: c.description ?? '',
      targetDist,
      startDate: c.start_date,
      endDate: c.end_date,
    })
    setEditError('')
    setEditingChallenge(c)
  }

  async function saveEdit() {
    if (!editingChallenge) return
    setEditError('')
    if (!editForm.name.trim() || !editForm.startDate || !editForm.endDate) {
      setEditError('Please fill in all required fields.')
      return
    }
    let target_meters: number | null = null
    let config: Record<string, unknown> = editingChallenge.config
    if (editType === 'group_distance') {
      const dist = parseFloat(editForm.targetDist)
      if (isNaN(dist) || dist <= 0) { setEditError('Please enter a valid target distance.'); return }
      target_meters = unit === 'miles' ? dist * 1609.344 : dist * 1000
    } else if (editType === 'weekly_quota') {
      const dist = parseFloat(editForm.targetDist)
      if (isNaN(dist) || dist <= 0) { setEditError('Please enter a valid weekly quota.'); return }
      target_meters = unit === 'miles' ? dist * 1609.344 : dist * 1000
      config = { ...config, weekly_meters: target_meters }
    } else if (editType === 'elevation') {
      const m = parseFloat(editForm.targetDist)
      if (isNaN(m) || m <= 0) { setEditError('Please enter a valid elevation target.'); return }
      target_meters = m
    } else if (editType === 'run_count') {
      const n = parseInt(editForm.targetDist)
      if (isNaN(n) || n <= 0) { setEditError('Please enter a valid run count.'); return }
      target_meters = n
    } else if (editType === 'fastest_effort') {
      config = {}
    }
    setEditSaving(true)
    const res = await fetch(`/api/groups/${group.id}/challenges`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: editingChallenge.id,
        name: editForm.name,
        description: editForm.description,
        target_meters,
        start_date: editForm.startDate,
        end_date: editForm.endDate,
        challenge_type: editType,
        config,
      }),
    })
    const data = await res.json()
    setEditSaving(false)
    if (!res.ok) { setEditError(data.error ?? 'Failed to save.'); return }
    setChallenges(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c))
    setEditingChallenge(null)
  }

  async function generateChallenge() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/groups/${group.id}/challenges/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.skipped) {
        alert('A coach challenge already exists for this month.')
      } else if (data.challenge) {
        setChallenges(prev => [data.challenge, ...prev])
      } else {
        alert(data.error ?? 'Failed to generate challenge.')
      }
    } catch {
      alert('Failed to generate challenge.')
    } finally {
      setGenerating(false)
    }
  }

  function ChallengeCard({ c }: { c: Challenge }) {
    const status = challengeStatus(c, today)
    const isPast = status === 'past'
    const isUpcoming = status === 'upcoming'
    const daysLeft = Math.round((Date.parse(c.end_date) - Date.parse(today)) / 86400000) + 1
    const daysToStart = Math.round((Date.parse(c.start_date) - Date.parse(today)) / 86400000)
    const cType = c.challenge_type ?? 'group_distance'

    return (
      <div className={`${status === 'active' ? 'bg-[#f97316]/[0.06] rounded-xl p-3 -mx-3' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-bold">{c.name}</span>
              {c.created_by_coach && (
                <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 border border-[#f97316]/20 px-1.5 py-0.5 rounded">✦ Coach</span>
              )}
              {status === 'active' && (
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-1.5 py-0.5 rounded">Active</span>
              )}
              {isUpcoming && (
                <span className="text-[10px] text-sky-400 font-bold bg-sky-400/10 px-1.5 py-0.5 rounded">Upcoming</span>
              )}
            </div>
            <p className="text-[#6b7280] text-xs">
              {format(parseISO(c.start_date), 'MMM d')} – {format(parseISO(c.end_date), 'MMM d, yyyy')}
              {status === 'active' && ` · ${daysLeft}d left`}
              {isUpcoming && ` · starts in ${daysToStart}d`}
            </p>
          </div>
          {myRole === 'admin' && (
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              <button
                onClick={() => openEdit(c)}
                className="text-[#4b5563] hover:text-[#f97316] transition-colors"
                title="Edit challenge"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button
                onClick={() => deleteChallenge(c.id)}
                className="text-[#4b5563] hover:text-red-400 transition-colors"
                title="Delete challenge"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          )}
        </div>

        {c.description && (
          <p className="text-[#6b7280] text-xs mb-3">{c.description}</p>
        )}

        {/* ── group_distance ── */}
        {cType === 'group_distance' && (() => {
          const { totalMeters, byMember } = computeChallengeProgress(leaderboardRuns, c, members)
          const pct = Math.min(100, (totalMeters / (c.target_meters ?? 1)) * 100)
          return (
            <>
              <div className="mb-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-[#6b7280]">
                    {toDisplay(totalMeters).toFixed(1)} / {toDisplay(c.target_meters ?? 0).toFixed(0)} {label}
                  </span>
                  <span className={`text-sm font-mono font-bold ${isPast ? (pct >= 100 ? 'text-emerald-400' : 'text-[#9ca3af]') : 'text-[#f97316]'}`}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-[#1c1c1c] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: isPast ? (pct >= 100 ? '#34d399' : '#3a3a3a') : '#f97316',
                    }}
                  />
                </div>
              </div>
              {!isUpcoming && byMember.some(m => m.meters > 0) && (
                <div className="space-y-1.5">
                  {byMember.map(m => {
                    const memberPct = Math.min(100, (m.meters / (c.target_meters ?? 1)) * 100)
                    return (
                      <div key={m.athlete_id} className="flex items-center gap-2">
                        <Avatar name={m.name} pic={m.profile_pic} size={5} />
                        <span className={`text-xs w-16 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                          {m.is_me ? 'You' : m.name.split(' ')[0]}
                        </span>
                        <div className="flex-1 h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${memberPct}%`, background: m.is_me ? '#f97316' : '#3a3a3a' }}
                          />
                        </div>
                        <span className={`text-xs font-mono w-14 text-right ${m.is_me ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>
                          {toDisplay(m.meters).toFixed(1)} {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}

        {/* ── weekly_quota ── */}
        {cType === 'weekly_quota' && (() => {
          const weeklyMeters = (c.config.weekly_meters as number) ?? 0
          const { weeks, byMember } = computeWeeklyQuota(leaderboardRuns, c, members)
          return (
            <>
              <p className="text-xs text-[#6b7280] mb-3">
                Weekly quota: <span className="text-white font-mono font-bold">{toDisplay(weeklyMeters).toFixed(0)} {label}</span> / week
              </p>
              {isUpcoming ? (
                <p className="text-xs text-[#4b5563]">Challenge hasn&apos;t started yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {byMember.map(m => {
                    const totalWeeks = weeks.filter(ws => ws <= today).length
                    const hitCount = m.weekResults.filter((hit, i) => weeks[i] <= today && hit).length
                    return (
                      <div key={m.athlete_id} className="flex items-center gap-2">
                        <Avatar name={m.name} pic={m.profile_pic} size={5} />
                        <span className={`text-xs w-16 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                          {m.is_me ? 'You' : m.name.split(' ')[0]}
                        </span>
                        <div className="flex gap-1 flex-1">
                          {weeks.map((ws, i) => {
                            const isFuture = ws > today
                            const hit = m.weekResults[i]
                            return (
                              <span
                                key={i}
                                title={`Week of ${format(parseISO(ws), 'MMM d')}`}
                                className={`w-4 h-4 rounded-full border text-[9px] flex items-center justify-center shrink-0 ${
                                  isFuture
                                    ? 'border-[#2a2a2a] bg-transparent'
                                    : hit
                                    ? 'bg-emerald-500 border-emerald-500 text-black'
                                    : 'bg-red-500/20 border-red-500/40'
                                }`}
                              />
                            )
                          })}
                        </div>
                        <span className={`text-xs font-mono shrink-0 ${m.is_me ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>
                          {hitCount}/{totalWeeks}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}

        {/* ── fastest_effort ── */}
        {cType === 'fastest_effort' && (() => {
          const { byMember } = computeFastestEffort(leaderboardRuns, c, members)
          const hasAny = byMember.some(m => m.bestEffort !== null)
          return (
            <>
              <p className="text-xs text-[#6b7280] mb-3">
                Best pace from a manual lap or 1 km split
              </p>
              {isUpcoming ? (
                <p className="text-xs text-[#4b5563]">Challenge hasn&apos;t started yet.</p>
              ) : !hasAny ? (
                <p className="text-xs text-[#4b5563]">No valid laps or 1 km splits yet.</p>
              ) : (
                <div className="space-y-2">
                  {byMember.map((m, i) => (
                    <div key={m.athlete_id} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 flex items-center justify-center text-base">
                        {m.bestEffort !== null
                          ? (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                            <span className="text-xs font-mono text-[#4b5563]">{i + 1}</span>
                          ))
                          : <span className="text-xs font-mono text-[#4b5563]">–</span>
                        }
                      </span>
                      <Avatar name={m.name} pic={m.profile_pic} size={5} />
                      <span className={`text-xs flex-1 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                        {m.is_me ? 'You' : m.name.split(' ')[0]}
                      </span>
                      {m.bestEffort !== null ? (
                        <Link
                          href={`/runs/${m.bestEffort.activityId}?from=group/${group.id}`}
                          className={`text-xs font-mono shrink-0 underline underline-offset-2 hover:opacity-80 ${m.is_me ? 'text-[#f97316]' : 'text-white'}`}
                        >
                          {`${speedToPace(m.bestEffort.averageSpeed, unit)}${paceUnitLabel(unit)}`}
                        </Link>
                      ) : (
                        <span className="text-xs font-mono shrink-0 text-[#4b5563]">No valid split</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        })()}

        {/* ── elevation ── */}
        {cType === 'elevation' && (() => {
          const { totalElevation, byMember } = computeElevationProgress(leaderboardRuns, c, members)
          const target = c.target_meters ?? 0
          const pct = target > 0 ? Math.min(100, (totalElevation / target) * 100) : 0
          return (
            <>
              <div className="mb-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-[#6b7280]">
                    {Math.round(totalElevation)}m / {Math.round(target)}m elevation
                  </span>
                  <span className={`text-sm font-mono font-bold ${isPast ? (pct >= 100 ? 'text-emerald-400' : 'text-[#9ca3af]') : 'text-[#f97316]'}`}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-[#1c1c1c] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: isPast ? (pct >= 100 ? '#34d399' : '#3a3a3a') : '#f97316' }}
                  />
                </div>
              </div>
              {!isUpcoming && byMember.some(m => m.elevation > 0) && (
                <div className="space-y-1.5">
                  {byMember.filter(m => m.elevation > 0).map(m => {
                    const mPct = Math.min(100, (m.elevation / target) * 100)
                    return (
                      <div key={m.athlete_id} className="flex items-center gap-2">
                        <Avatar name={m.name} pic={m.profile_pic} size={5} />
                        <span className={`text-xs w-16 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                          {m.is_me ? 'You' : m.name.split(' ')[0]}
                        </span>
                        <div className="flex-1 h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${mPct}%`, background: m.is_me ? '#f97316' : '#3a3a3a' }} />
                        </div>
                        <span className={`text-xs font-mono w-14 text-right ${m.is_me ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>
                          {Math.round(m.elevation)}m
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}

        {/* ── run_count ── */}
        {cType === 'run_count' && (() => {
          const { totalCount, byMember } = computeRunCountProgress(leaderboardRuns, c, members)
          const target = c.target_meters ?? 0
          const pct = target > 0 ? Math.min(100, (totalCount / target) * 100) : 0
          return (
            <>
              <div className="mb-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-[#6b7280]">
                    {totalCount} / {target} runs
                  </span>
                  <span className={`text-sm font-mono font-bold ${isPast ? (pct >= 100 ? 'text-emerald-400' : 'text-[#9ca3af]') : 'text-[#f97316]'}`}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-[#1c1c1c] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: isPast ? (pct >= 100 ? '#34d399' : '#3a3a3a') : '#f97316' }}
                  />
                </div>
              </div>
              {!isUpcoming && byMember.some(m => m.count > 0) && (
                <div className="space-y-1.5">
                  {byMember.filter(m => m.count > 0).map((m, i) => (
                    <div key={m.athlete_id} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-center text-base">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-xs font-mono text-[#4b5563]">{i + 1}</span>}
                      </span>
                      <Avatar name={m.name} pic={m.profile_pic} size={5} />
                      <span className={`text-xs flex-1 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                        {m.is_me ? 'You' : m.name.split(' ')[0]}
                      </span>
                      <span className={`text-xs font-mono ${m.is_me ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>
                        {m.count} run{m.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="fade-up space-y-8">

      {/* Group Chat */}
      <div>
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-4">Group Chat</h2>
        <GroupMessageBoard
          groupId={group.id}
          members={members.map(m => ({ athlete_id: m.athlete_id, name: m.name, profile_pic: m.profile_pic, is_me: m.is_me }))}
          myRole={myRole}
        />
      </div>




      {/* RDCoach */}
      <div>
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-4">RDCoach</h2>
        <GroupCoachTab groupId={group.id} myRole={myRole} members={members} initialBriefing={initialBriefing} initialBriefingMeta={initialBriefingMeta} />
      </div>

      {/* Leaderboard */}
      <div>
        <div className="mb-4">
          <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-3">Leaderboard</h2>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {ranges.map(r => (
              <button
                key={r.key}
                onClick={() => setLeaderRange(r.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors shrink-0 ${
                  leaderRange === r.key
                    ? 'bg-[#f97316] text-black'
                    : 'bg-[#1a1a1a] text-[#6b7280] hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
        {board.every(e => e.distance === 0) ? (
          <p className="text-[#6b7280] text-sm text-center py-4">No runs recorded in this period.</p>
        ) : (
          <div className="space-y-3">
            {board.map((entry, i) => {
              const dist = toDisplay(entry.distance)
              const pct = (entry.distance / maxDist) * 100
              return (
                <div key={entry.athlete_id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                      <span className="text-xs font-mono text-[#4b5563]">{i + 1}</span>
                    )}
                  </span>
                  <Avatar name={entry.name} pic={entry.profile_pic} size={7} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-xs font-bold truncate ${entry.is_me ? 'text-white' : 'text-[#d1d5db]'}`}>
                          {entry.is_me ? 'You' : entry.name.split(' ')[0]}
                        </span>
                        {entry.tier && (
                          <span className="flex items-center gap-1 font-mono text-[10px] font-bold shrink-0" style={{ color: 'var(--accent)' }} title={entry.tier.name}>
                            <WeaponSprite tier={entry.tier} size={14} />Lv {tierNumber(entry.tier)}
                          </span>
                        )}
                        <span className="text-[#4b5563] text-[10px] shrink-0">
                          {entry.count} run{entry.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className={`text-xs font-mono font-bold shrink-0 ml-2 ${entry.is_me ? 'text-[#f97316]' : 'text-[#9ca3af]'}`}>
                        {dist.toFixed(1)} {label}
                      </span>
                    </div>
                    <div className="h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: entry.is_me ? '#f97316' : '#3a3a3a' }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </div>
      </div>

      {/* Challenges */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">Challenges</h2>
          <div className="flex items-center gap-2">
            {myRole === 'admin' && (
              <button
                onClick={generateChallenge}
                disabled={generating}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f97316] text-[#9ca3af] hover:text-[#f97316] rounded-lg transition-colors disabled:opacity-50"
                title="Generate a coach challenge for this month"
              >
                ✦ {generating ? 'Generating…' : 'Coach'}
              </button>
            )}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[#f97316] hover:bg-[#ea580c] text-black rounded-lg transition-colors"
            >
              <Plus size={12} />
              New
            </button>
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
        {challenges.length === 0 ? (
          <div className="text-center py-6">
            <Trophy size={24} className="text-[#2a2a2a] mx-auto mb-2" />
            <p className="text-[#6b7280] text-sm">No challenges yet.</p>
            <p className="text-[#4b5563] text-xs mt-1">Create one to motivate the group!</p>
          </div>
        ) : (
          <div>
            {active.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>Active</p>
                <div className="space-y-4">{active.map(c => <ChallengeCard key={c.id} c={c} />)}</div>
              </div>
            )}
            {upcoming.length > 0 && (
              <div className={active.length > 0 ? 'mt-5 pt-5 border-t border-[#1c1c1c]' : ''}>
                <p className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>Upcoming</p>
                <div className="space-y-4">{upcoming.map(c => <ChallengeCard key={c.id} c={c} />)}</div>
              </div>
            )}
            {lastMonthChallenge && lastMonthSummary && (
              <div className={(active.length > 0 || upcoming.length > 0) ? 'mt-5 pt-5 border-t border-[#1c1c1c]' : ''}>
                <p className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>Last Month</p>
                <div className="bg-[#0f0f0f] rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{lastMonthChallenge.name}</span>
                        {lastMonthChallenge.created_by_coach && (
                          <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 border border-[#f97316]/20 px-1.5 py-0.5 rounded">✦ Coach</span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#4b5563] font-mono">
                        {format(parseISO(lastMonthChallenge.start_date), 'MMM d')} – {format(parseISO(lastMonthChallenge.end_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded shrink-0 ${lastMonthSummary.achieved ? 'text-emerald-400 bg-emerald-400/10' : 'text-[#9ca3af] bg-[#1a1a1a]'}`}>
                      {lastMonthSummary.achieved ? 'Completed' : 'Not Completed'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-mono font-bold ${lastMonthSummary.achieved ? 'text-emerald-400' : 'text-[#d1d5db]'}`}>
                        {lastMonthSummary.resultStr}
                      </p>
                      {lastMonthSummary.winnerLabel && (
                        <p className="text-xs text-[#6b7280] mt-1">{lastMonthSummary.winnerLabel}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div className={(active.length > 0 || upcoming.length > 0) ? 'mt-5 pt-5 border-t border-[#1c1c1c]' : ''}>
                <button
                  onClick={() => setShowHistory(h => !h)}
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest mb-3 hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-3)' }}
                >
                  History ({past.length})
                  <span className={`transition-transform ${showHistory ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {showHistory && (
                  <div className="divide-y divide-[#1c1c1c]">
                    {past.map(c => {
                      const { achieved, resultStr } = summarizePastChallenge(c, leaderboardRuns, members, unit)
                      return (
                        <div key={c.id} className="flex items-center justify-between py-2.5 gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-sm shrink-0 ${achieved ? 'text-emerald-400' : 'text-[#4b5563]'}`}>
                              {achieved ? '✓' : '○'}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-white truncate">{c.name}</span>
                                {c.created_by_coach && (
                                  <span className="text-[10px] text-[#f97316] font-bold">✦</span>
                                )}
                              </div>
                              <p className="text-[10px] text-[#4b5563] font-mono">
                                {format(parseISO(c.start_date), 'MMM d')} – {format(parseISO(c.end_date), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-mono ${achieved ? 'text-emerald-400' : 'text-[#6b7280]'}`}>{resultStr}</span>
                            {myRole === 'admin' && (
                              <button onClick={() => deleteChallenge(c.id)} className="text-[#2a2a2a] hover:text-red-400 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>{/* end challenges card */}
      </div>{/* end challenges section */}

      {/* Training Load */}
      <div>
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-4">Training Load</h2>
        <div className="card" style={{ padding: '1.25rem' }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {members.map(m => {
            const load = memberTrainingLoads[m.athlete_id] ?? { ctl: 0, atl: 0, tsb: 0 }
            const tsbColor = load.tsb > 5 ? 'text-emerald-400' : load.tsb >= -10 ? 'text-yellow-400' : 'text-red-400'
            const formLabel = load.tsb > 5 ? 'Fresh' : load.tsb >= -10 ? 'Tired' : 'Very Tired'
            const hasData = load.ctl > 0 || load.atl > 0
            return (
              <div key={m.athlete_id} className="bg-[#0f0f0f] rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Avatar name={m.name} pic={m.profile_pic} size={5} />
                  <span className={`text-xs font-bold truncate ${m.is_me ? 'text-white' : 'text-[#d1d5db]'}`}>
                    {m.is_me ? 'You' : m.name.split(' ')[0]}
                  </span>
                  {hasData && (
                    <span className={`text-[9px] font-bold shrink-0 ${tsbColor}`}>{formLabel}</span>
                  )}
                </div>
                {hasData ? (
                  <div className="flex justify-between">
                    <div>
                      <p className="text-[9px] text-[#6b7280] uppercase tracking-wide leading-none mb-1">Fit</p>
                      <p className="text-base font-mono font-bold text-blue-400">{load.ctl.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#6b7280] uppercase tracking-wide leading-none mb-1">Fat</p>
                      <p className="text-base font-mono font-bold text-orange-400">{load.atl.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#6b7280] uppercase tracking-wide leading-none mb-1">Form</p>
                      <p className={`text-base font-mono font-bold ${tsbColor}`}>{load.tsb > 0 ? '+' : ''}{load.tsb.toFixed(1)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-[#4b5563]">No data</p>
                )}
              </div>
            )
          })}
        </div>
        </div>{/* end training load card */}
      </div>{/* end training load section */}

      {/* Members */}
      <div>
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-4">Members</h2>
        <div className="card" style={{ padding: '1.25rem' }}>
        <div className="divide-y divide-[#1c1c1c]">
          {members.map(m => (
            <div key={m.athlete_id} className="flex items-center gap-2.5 py-3 first:pt-0 last:pb-0">
              <Avatar name={m.name} pic={m.profile_pic} size={7} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{m.name}</span>
                  {m.is_me && <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>}
                  {m.role === 'admin' && <span className="text-[10px] text-yellow-400 font-bold bg-yellow-400/10 px-1.5 py-0.5 rounded">Admin</span>}
                  {m.gender && <span className="text-[10px] text-[#4b5563] font-mono">{m.gender === 'M' ? '♂' : '♀'}</span>}
                </div>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  Joined {format(new Date(m.joined_at), 'MMM d, yyyy')}
                  {m.goals.length > 0 && ` · ${m.goals.length} goal${m.goals.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              {myRole === 'admin' && !m.is_me && (
                <div className="flex items-center gap-1 shrink-0">
                  {m.role === 'admin' ? (
                    <button
                      onClick={() => onUpdateMemberRole(m.athlete_id, 'member')}
                      className="p-1.5 rounded-lg text-yellow-400/60 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                      title="Remove admin"
                    >
                      <ShieldOff size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onUpdateMemberRole(m.athlete_id, 'admin')}
                      className="p-1.5 rounded-lg text-[#4b5563] hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                      title="Make admin"
                    >
                      <Shield size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => onKickMember(m.athlete_id)}
                    className="p-1.5 rounded-lg text-[#4b5563] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Remove from group"
                  >
                    <UserMinus size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        </div>{/* end members card */}
      </div>{/* end members section */}

      {/* Edit challenge modal */}
      {editingChallenge && (
        <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-md p-6 z-[9999]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-lg">Edit Challenge</h2>
              <button onClick={() => setEditingChallenge(null)} className="text-[#6b7280] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Type</label>
                <div className="flex gap-2">
                  {([
                    { key: 'group_distance', label: 'Distance' },
                    { key: 'weekly_quota',   label: 'Weekly' },
                    { key: 'elevation',      label: 'Elevation' },
                    { key: 'run_count',      label: 'Run Count' },
                    { key: 'fastest_effort', label: 'Fastest' },
                  ] as const).map(({ key, label: optLabel }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEditType(key)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                        editType === key
                          ? 'bg-[#f97316] border-[#f97316] text-black'
                          : 'bg-transparent border-[#2a2a2a] text-[#6b7280] hover:text-white hover:border-[#4b5563]'
                      }`}
                    >
                      {optLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Description</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional note for the group"
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>

              {(editType === 'group_distance' || editType === 'weekly_quota' || editType === 'elevation' || editType === 'run_count') && (
                <div>
                  <label className="block text-xs font-bold text-[#6b7280] mb-1.5">
                    {editType === 'group_distance' ? `Group target (${unit === 'miles' ? 'mi' : 'km'}) *`
                      : editType === 'weekly_quota' ? `Weekly quota per member (${unit === 'miles' ? 'mi' : 'km'}) *`
                      : editType === 'elevation' ? 'Group elevation target (meters) *'
                      : 'Group run count target *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.targetDist}
                    onChange={e => setEditForm(f => ({ ...f, targetDist: e.target.value }))}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}

              {editType === 'fastest_effort' && (
                <p className="text-xs text-[#6b7280]">
                  Uses each member&apos;s fastest manual lap or fastest 1 km split during the challenge window.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Start date *</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b7280] mb-1.5">End date *</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              {editError && (
                <p className="text-red-400 text-xs">{editError}</p>
              )}

              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="w-full py-2.5 bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-black font-bold text-sm rounded-lg transition-colors"
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create challenge modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-md p-6 z-[9999]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-lg">New Challenge</h2>
              <button onClick={() => setShowCreate(false)} className="text-[#6b7280] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Type</label>
                <div className="flex gap-2">
                  {([
                    { key: 'group_distance', label: 'Distance' },
                    { key: 'weekly_quota',   label: 'Weekly' },
                    { key: 'elevation',      label: 'Elevation' },
                    { key: 'run_count',      label: 'Run Count' },
                    { key: 'fastest_effort', label: 'Fastest' },
                  ] as const).map(({ key, label: optLabel }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChallengeType(key)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                        challengeType === key
                          ? 'bg-[#f97316] border-[#f97316] text-black'
                          : 'bg-transparent border-[#2a2a2a] text-[#6b7280] hover:text-white hover:border-[#4b5563]'
                      }`}
                    >
                      {optLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={
                    challengeType === 'group_distance' ? 'e.g. March 200km' :
                    challengeType === 'weekly_quota'   ? 'e.g. Weekly 30km Club' :
                    'e.g. Speed King'
                  }
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional note for the group"
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>

              {/* Target field */}
              {(challengeType === 'group_distance' || challengeType === 'weekly_quota' || challengeType === 'elevation' || challengeType === 'run_count') && (
                <div>
                  <label className="block text-xs font-bold text-[#6b7280] mb-1.5">
                    {challengeType === 'group_distance' ? `Group target (${unit === 'miles' ? 'mi' : 'km'}) *`
                      : challengeType === 'weekly_quota' ? `Weekly quota per member (${unit === 'miles' ? 'mi' : 'km'}) *`
                      : challengeType === 'elevation' ? 'Group elevation target (meters) *'
                      : 'Group run count target *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.targetDist}
                    onChange={e => setForm(f => ({ ...f, targetDist: e.target.value }))}
                    placeholder={
                      challengeType === 'group_distance' ? (unit === 'miles' ? '150' : '200')
                        : challengeType === 'weekly_quota' ? (unit === 'miles' ? '18' : '30')
                        : challengeType === 'elevation' ? '5000'
                        : '50'
                    }
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}

              {challengeType === 'fastest_effort' && (
                <p className="text-xs text-[#6b7280]">
                  Uses each member&apos;s fastest manual lap or fastest 1 km split during the challenge window.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Start date *</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b7280] mb-1.5">End date *</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-red-400 text-xs">{formError}</p>
              )}

              <button
                onClick={createChallenge}
                disabled={formSaving}
                className="w-full py-2.5 bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-black font-bold text-sm rounded-lg transition-colors"
              >
                {formSaving ? 'Creating…' : 'Create Challenge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
