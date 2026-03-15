'use client'
import { useState } from 'react'
import { Copy, Check, Users, Target, Activity, Trash2, BarChart2, Flame, Trophy, Plus, X } from 'lucide-react'
import { format } from 'date-fns'
import { toJakartaDate, speedToPace, formatDuration, formatDistanceShort, paceUnitLabel, distanceUnitLabel, metersToMiles } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'

interface Goal {
  id: string
  athlete_id: number
  distance_key: string
  label: string
  target_secs: number
  current_secs: number | null
  race_date: string
}

interface Member {
  athlete_id: number
  role: string
  joined_at: string
  name: string
  profile_pic: string | null
  gender: string | null
  goals: Goal[]
  is_me: boolean
}

interface Run {
  id: number
  athlete_id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate: number | null
  run_type: string | null
}

interface Group {
  id: string
  name: string
  invite_code: string
  created_by: number
  created_at: string
}

interface LeaderboardRun {
  id: number
  athlete_id: number
  distance: number
  start_date: string
}

interface Challenge {
  id: string
  group_id: string
  name: string
  description: string | null
  target_meters: number
  start_date: string
  end_date: string
  created_by: number
  created_at: string
}

interface Props {
  group: Group
  members: Member[]
  recentRuns: Run[]
  leaderboardRuns: LeaderboardRun[]
  initialChallenges: Challenge[]
  myRole: string
  inviteUrl: string
  myAthleteId: number
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Avatar({ name, pic, size = 8 }: { name: string; pic: string | null; size?: number }) {
  if (pic) {
    return <img src={pic} alt={name} className={`w-${size} h-${size} rounded-full object-cover`} />
  }
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`w-${size} h-${size} rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-xs`}>
      {initials}
    </div>
  )
}

function RunTypeDot({ type }: { type: string | null }) {
  const colors: Record<string, string> = {
    interval_5k: 'bg-red-500',
    threshold: 'bg-orange-500',
    long_easy: 'bg-sky-500',
    easy: 'bg-emerald-500',
    easy_strides: 'bg-teal-500',
    recovery: 'bg-green-400',
  }
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[type ?? ''] ?? 'bg-zinc-500'}`} />
  )
}

// ── Leaderboard helpers ────────────────────────────────────────────────────

type LeaderRange = 'week' | 'month' | 'ytd' | '6m'

function getRangeStart(range: LeaderRange): Date {
  const now = new Date()
  if (range === 'week') {
    const d = new Date(now)
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1
    d.setDate(d.getDate() - diff)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (range === 'ytd')   return new Date(now.getFullYear(), 0, 1)
  return new Date(Date.now() - 182 * 24 * 60 * 60 * 1000)
}

function computeStreak(allRuns: LeaderboardRun[], athleteId: number): number {
  const runs = allRuns.filter(r => r.athlete_id === athleteId)
  if (runs.length === 0) return 0

  const getWeekStart = (d: Date) => {
    const date = new Date(d)
    date.setHours(0, 0, 0, 0)
    const day = date.getDay()
    date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
    return date.getTime()
  }

  const weeks = Array.from(new Set(runs.map(r => getWeekStart(new Date(r.start_date))))).sort((a, b) => b - a)
  const thisWeek = getWeekStart(new Date())
  const lastWeek = thisWeek - 7 * 24 * 60 * 60 * 1000

  if (weeks[0] !== thisWeek && weeks[0] !== lastWeek) return 0

  let streak = 1
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] === weeks[i - 1] - 7 * 24 * 60 * 60 * 1000) streak++
    else break
  }
  return streak
}

function computeLeaderboard(runs: LeaderboardRun[], range: LeaderRange, members: Member[]) {
  const cutoff = getRangeStart(range)
  const filtered = runs.filter(r => new Date(r.start_date) >= cutoff)
  const totals: Record<number, { distance: number; count: number }> = {}
  for (const r of filtered) {
    if (!totals[r.athlete_id]) totals[r.athlete_id] = { distance: 0, count: 0 }
    totals[r.athlete_id].distance += r.distance
    totals[r.athlete_id].count += 1
  }
  return members
    .map(m => ({
      athlete_id: m.athlete_id,
      name: m.name,
      profile_pic: m.profile_pic,
      is_me: m.is_me,
      distance: totals[m.athlete_id]?.distance ?? 0,
      count: totals[m.athlete_id]?.count ?? 0,
      streak: computeStreak(runs, m.athlete_id),
    }))
    .sort((a, b) => b.distance - a.distance)
}

// ── Challenge helpers ──────────────────────────────────────────────────────

function challengeStatus(c: Challenge): 'active' | 'upcoming' | 'past' {
  const now = new Date()
  const start = new Date(c.start_date)
  const end = new Date(c.end_date)
  end.setHours(23, 59, 59, 999)
  if (now < start) return 'upcoming'
  if (now > end)   return 'past'
  return 'active'
}

function computeChallengeProgress(
  leaderboardRuns: LeaderboardRun[],
  challenge: Challenge,
  members: Member[],
) {
  const start = new Date(challenge.start_date)
  const end = new Date(challenge.end_date)
  end.setHours(23, 59, 59, 999)
  const relevant = leaderboardRuns.filter(r => {
    const d = new Date(r.start_date)
    return d >= start && d <= end
  })
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

// ── Component ──────────────────────────────────────────────────────────────

export default function GroupPageClient({
  group, members, recentRuns, leaderboardRuns, initialChallenges, myRole, inviteUrl, myAthleteId,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'dashboard' | 'feed' | 'goals'>('dashboard')

  // Leaderboard
  const [leaderRange, setLeaderRange] = useState<LeaderRange>('week')

  // Feed
  const [allFeedRuns, setAllFeedRuns] = useState<Run[]>(recentRuns)
  const [hasMore, setHasMore] = useState(recentRuns.length === 100)
  const [loadingMore, setLoadingMore] = useState(false)
  const [feedMember, setFeedMember] = useState<number | 'all'>('all')
  const [feedType, setFeedType] = useState<string | 'all'>('all')

  // Challenges
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', targetDist: '', startDate: '', endDate: '' })
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  const { unit } = useUnit()
  const memberMap = Object.fromEntries(members.map(m => [m.athlete_id, m]))

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function loadMoreRuns() {
    setLoadingMore(true)
    const oldest = allFeedRuns[allFeedRuns.length - 1]?.start_date
    const res = await fetch(`/api/groups/${group.id}/runs?before=${oldest}&limit=30`)
    const { runs } = await res.json()
    setAllFeedRuns(prev => [...prev, ...(runs ?? [])])
    setHasMore((runs ?? []).length === 30)
    setLoadingMore(false)
  }

  async function createChallenge() {
    setFormError('')
    const dist = parseFloat(form.targetDist)
    if (!form.name.trim() || isNaN(dist) || dist <= 0 || !form.startDate || !form.endDate) {
      setFormError('Please fill in all required fields.')
      return
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setFormError('End date must be after start date.')
      return
    }
    const target_meters = unit === 'miles' ? dist * 1609.344 : dist * 1000
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
      }),
    })
    const data = await res.json()
    setFormSaving(false)
    if (!res.ok) { setFormError(data.error ?? 'Failed to create challenge.'); return }
    setChallenges(prev => [data, ...prev])
    setShowCreate(false)
    setForm({ name: '', description: '', targetDist: '', startDate: '', endDate: '' })
  }

  async function deleteChallenge(id: string) {
    if (!confirm('Delete this challenge?')) return
    const res = await fetch(`/api/groups/${group.id}/challenges?challengeId=${id}`, { method: 'DELETE' })
    if (res.ok) setChallenges(prev => prev.filter(c => c.id !== id))
  }

  // Feed filters
  const presentTypes = Array.from(new Set(allFeedRuns.map(r => r.run_type ?? 'run'))).sort()
  const filteredFeed = allFeedRuns.filter(r => {
    if (feedMember !== 'all' && r.athlete_id !== feedMember) return false
    if (feedType !== 'all' && (r.run_type ?? 'run') !== feedType) return false
    return true
  })

  return (
    <main className="max-w-4xl mx-auto px-4 pt-14 sm:pt-20 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 fade-up">
        <div>
          <h1 className="font-display font-extrabold text-4xl">{group.name}</h1>
          <p className="text-[#6b7280] text-sm mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} · Created {format(new Date(group.created_at), 'MMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={copyInvite}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#f97316] text-[#6b7280] hover:text-[#f97316] rounded-lg transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Invite link'}
        </button>
      </div>

      {/* Invite banner */}
      {members.length < 2 && (
        <div className="card border-dashed border-[#2a2a2a] mb-6 fade-up">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#f97316]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Users size={14} className="text-[#f97316]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm mb-1">Invite your training partners</p>
              <p className="text-[#6b7280] text-xs mb-3">Share this link so they can join the group.</p>
              <div className="flex items-center gap-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2">
                <span className="text-[#6b7280] text-xs font-mono truncate flex-1">{inviteUrl}</span>
                <button onClick={copyInvite} className="text-[#f97316] text-xs font-bold shrink-0 hover:underline">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-[#1c1c1c] fade-up">
        {([
          { key: 'dashboard', label: 'Dashboard', icon: BarChart2 },
          { key: 'feed',      label: 'Runs',      icon: Activity },
          { key: 'goals',     label: 'Goals',     icon: Target },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-[#f97316] text-white'
                : 'border-transparent text-[#6b7280] hover:text-white'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ─────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (() => {
        const label = distanceUnitLabel(unit)
        const toDisplay = (m: number) => unit === 'miles' ? metersToMiles(m) : m / 1000
        const board = computeLeaderboard(leaderboardRuns, leaderRange, members)
        const maxDist = Math.max(...board.map(e => e.distance), 1)
        const ranges: { key: LeaderRange; label: string }[] = [
          { key: 'week',  label: 'This Week' },
          { key: 'month', label: 'This Month' },
          { key: 'ytd',   label: 'Year to Date' },
          { key: '6m',    label: 'Last 6 Months' },
        ]

        const active   = challenges.filter(c => challengeStatus(c) === 'active')
        const upcoming = challenges.filter(c => challengeStatus(c) === 'upcoming')
        const past     = challenges.filter(c => challengeStatus(c) === 'past')

        function ChallengeCard({ c }: { c: Challenge }) {
          const status = challengeStatus(c)
          const { totalMeters, byMember } = computeChallengeProgress(leaderboardRuns, c, members)
          const pct = Math.min(100, (totalMeters / c.target_meters) * 100)
          const daysLeft = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86400000)
          const isPast = status === 'past'
          const isUpcoming = status === 'upcoming'
          const daysToStart = Math.ceil((new Date(c.start_date).getTime() - Date.now()) / 86400000)

          return (
            <div className={`card ${status === 'active' ? 'border-[#f97316]/30' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold">{c.name}</span>
                    {status === 'active' && (
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-1.5 py-0.5 rounded">Active</span>
                    )}
                    {isUpcoming && (
                      <span className="text-[10px] text-sky-400 font-bold bg-sky-400/10 px-1.5 py-0.5 rounded">Upcoming</span>
                    )}
                  </div>
                  <p className="text-[#6b7280] text-xs">
                    {format(new Date(c.start_date), 'MMM d')} – {format(new Date(c.end_date), 'MMM d, yyyy')}
                    {status === 'active' && ` · ${daysLeft}d left`}
                    {isUpcoming && ` · starts in ${daysToStart}d`}
                  </p>
                </div>
                {myRole === 'admin' && (
                  <button
                    onClick={() => deleteChallenge(c.id)}
                    className="text-[#4b5563] hover:text-red-400 transition-colors ml-2 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {c.description && (
                <p className="text-[#6b7280] text-xs mb-3">{c.description}</p>
              )}

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-[#6b7280]">
                    {toDisplay(totalMeters).toFixed(1)} / {toDisplay(c.target_meters).toFixed(0)} {label}
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

              {/* Member breakdown */}
              {!isUpcoming && byMember.some(m => m.meters > 0) && (
                <div className="space-y-1.5">
                  {byMember.map(m => {
                    const memberPct = Math.min(100, (m.meters / c.target_meters) * 100)
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
            </div>
          )
        }

        return (
          <div className="fade-up space-y-8">

            {/* Leaderboard section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-[#6b7280] uppercase tracking-widest">Leaderboard</p>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {ranges.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setLeaderRange(r.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      leaderRange === r.key
                        ? 'bg-[#f97316] text-black'
                        : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {board.every(e => e.distance === 0) ? (
                <div className="card text-center py-8">
                  <p className="text-[#6b7280] text-sm">No runs recorded in this period.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {board.map((entry, i) => {
                    const dist = toDisplay(entry.distance)
                    const pct = (entry.distance / maxDist) * 100
                    return (
                      <div key={entry.athlete_id} className="card">
                        <div className="flex items-center gap-3">
                          <span className="w-5 shrink-0 flex items-center justify-center text-base">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                              <span className="text-xs font-mono text-[#4b5563]">{i + 1}</span>
                            )}
                          </span>
                          <Avatar name={entry.name} pic={entry.profile_pic} size={8} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-sm font-bold ${entry.is_me ? 'text-white' : 'text-[#d1d5db]'}`}>
                                  {entry.is_me ? 'You' : entry.name.split(' ')[0]}
                                </span>
                                {entry.is_me && (
                                  <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>
                                )}
                                {entry.streak >= 2 && (
                                  <span className="flex items-center gap-0.5 text-orange-400 text-[10px] font-bold">
                                    <Flame size={10} />{entry.streak}w
                                  </span>
                                )}
                                <span className="text-[#4b5563] text-xs">
                                  {entry.count} run{entry.count !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <span className={`text-sm font-mono font-bold shrink-0 ml-2 ${entry.is_me ? 'text-[#f97316]' : 'text-[#9ca3af]'}`}>
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
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Challenges section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-[#6b7280] uppercase tracking-widest">Challenges</p>
                {myRole === 'admin' && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[#f97316] hover:bg-[#ea580c] text-black rounded-lg transition-colors"
                  >
                    <Plus size={12} />
                    New
                  </button>
                )}
              </div>
              {challenges.length === 0 ? (
                <div className="card text-center py-8">
                  <Trophy size={24} className="text-[#2a2a2a] mx-auto mb-2" />
                  <p className="text-[#6b7280] text-sm">No challenges yet.</p>
                  {myRole === 'admin' && (
                    <p className="text-[#4b5563] text-xs mt-1">Create one to motivate the group!</p>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {active.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-[#4b5563] uppercase tracking-widest mb-2">Active</p>
                      <div className="space-y-3">{active.map(c => <ChallengeCard key={c.id} c={c} />)}</div>
                    </div>
                  )}
                  {upcoming.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-[#4b5563] uppercase tracking-widest mb-2">Upcoming</p>
                      <div className="space-y-3">{upcoming.map(c => <ChallengeCard key={c.id} c={c} />)}</div>
                    </div>
                  )}
                  {past.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-[#4b5563] uppercase tracking-widest mb-2">Past</p>
                      <div className="space-y-3">{past.map(c => <ChallengeCard key={c.id} c={c} />)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Members section */}
            <div>
              <p className="text-xs font-bold text-[#6b7280] uppercase tracking-widest mb-3">Members</p>
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.athlete_id} className="card">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} pic={m.profile_pic} size={9} />
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
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )
      })()}

      {/* ── Feed tab ──────────────────────────────────────────────────────── */}
      {tab === 'feed' && (
        <div className="fade-up">
          {/* Filters */}
          {allFeedRuns.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {/* Member filter */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setFeedMember('all')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    feedMember === 'all' ? 'bg-[#f97316] text-black' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'
                  }`}
                >
                  All
                </button>
                {members.map(m => (
                  <button
                    key={m.athlete_id}
                    onClick={() => setFeedMember(feedMember === m.athlete_id ? 'all' : m.athlete_id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      feedMember === m.athlete_id ? 'bg-[#f97316] text-black' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'
                    }`}
                  >
                    {m.is_me ? 'You' : m.name.split(' ')[0]}
                  </button>
                ))}
              </div>
              {/* Run type filter */}
              {presentTypes.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setFeedType('all')}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      feedType === 'all' ? 'bg-[#2a2a2a] text-white' : 'bg-[#1a1a1a] text-[#6b7280] hover:text-white'
                    }`}
                  >
                    All types
                  </button>
                  {presentTypes.map(t => (
                    <button
                      key={t}
                      onClick={() => setFeedType(feedType === t ? 'all' : t)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        feedType === t ? 'bg-[#2a2a2a] text-white' : 'bg-[#1a1a1a] text-[#6b7280] hover:text-white'
                      }`}
                    >
                      {t.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filteredFeed.length === 0 ? (
              <div className="card text-center py-10">
                <p className="text-[#6b7280] text-sm">No runs match these filters.</p>
              </div>
            ) : filteredFeed.map(run => {
              const member = memberMap[run.athlete_id]
              const isMe = run.athlete_id === myAthleteId
              return (
                <div key={run.id} className="card hover:border-[#2a2a2a] transition-colors">
                  <div className="flex items-start gap-3">
                    <Avatar name={member?.name ?? '?'} pic={member?.profile_pic ?? null} size={8} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm">{member?.name ?? `Athlete ${run.athlete_id}`}</span>
                        {isMe && <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>}
                        {member?.gender && <span className="text-[10px] text-[#4b5563] font-mono">{member.gender === 'M' ? '♂' : '♀'}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#6b7280] mb-2">
                        <RunTypeDot type={run.run_type} />
                        <span>{run.run_type?.replace(/_/g, ' ') ?? 'run'}</span>
                        <span>·</span>
                        <span>{format(toJakartaDate(run.start_date), 'EEE MMM d, h:mm a')}</span>
                      </div>
                      <a href={`/runs/${run.id}`} className="font-medium text-sm text-white hover:text-[#f97316] transition-colors block truncate mb-2">
                        {run.name}
                      </a>
                      <div className="flex gap-4 text-xs font-mono">
                        <span className="text-[#f97316] font-bold">{formatDistanceShort(run.distance, unit)}</span>
                        <span className="text-white">{speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}</span>
                        <span className="text-[#6b7280]">{formatDuration(run.moving_time)}</span>
                        {run.average_heartrate && (
                          <span className="text-[#6b7280]">{Math.round(run.average_heartrate)} bpm</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={loadMoreRuns}
                disabled={loadingMore}
                className="px-4 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#f97316] text-[#6b7280] hover:text-[#f97316] rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load older runs'}
              </button>
            </div>
          )}
        </div>
      )}


      {/* ── Goals tab ─────────────────────────────────────────────────────── */}
      {tab === 'goals' && (
        <div className="space-y-6 fade-up">
          {members.map(m => (
            <div key={m.athlete_id}>
              <div className="flex items-center gap-2 mb-3">
                <Avatar name={m.name} pic={m.profile_pic} size={6} />
                <span className="font-bold text-sm">{m.name}</span>
                {m.is_me && <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>}
              </div>
              {m.goals.length === 0 ? (
                <p className="text-[#4b5563] text-xs pl-8">No goals set yet</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-8">
                  {m.goals.map(goal => {
                    const daysLeft = Math.ceil((new Date(goal.race_date).getTime() - Date.now()) / 86400000)
                    const isPast = daysLeft < 0
                    const km = { '5k': 5, '10k': 10, 'hm': 21.0975, 'fm': 42.195 }[goal.distance_key] ?? 5
                    const targetPace = goal.target_secs / km
                    const paceStr = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
                    const baselinePace = goal.current_secs ? goal.current_secs / km : targetPace + 30
                    const currentPace = goal.current_secs ? goal.current_secs / km : null
                    const progress = currentPace && baselinePace > targetPace
                      ? Math.min(1, Math.max(0, (baselinePace - currentPace) / (baselinePace - targetPace)))
                      : 0
                    return (
                      <div key={goal.id} className="bg-[#111] border border-[#1c1c1c] rounded-xl p-3">
                        <div className="font-bold text-sm mb-1">{goal.label}</div>
                        <div className="text-[#6b7280] text-xs mb-2">
                          {isPast ? 'Past race' : `${daysLeft}d away`} · {format(new Date(goal.race_date), 'MMM d yyyy')}
                        </div>
                        <div className="flex gap-3 text-xs mb-2">
                          <div>
                            <div className="text-[#4b5563] mb-0.5">Target</div>
                            <div className="font-mono text-[#f97316] font-bold">{paceStr(targetPace)}{paceUnitLabel(unit)}</div>
                          </div>
                          {goal.current_secs && (
                            <div>
                              <div className="text-[#4b5563] mb-0.5">Current</div>
                              <div className="font-mono text-white font-bold">{formatTime(goal.current_secs)}</div>
                            </div>
                          )}
                        </div>
                        <div className="h-1 bg-[#242424] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#f97316]" style={{ width: `${progress * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}


      {/* ── Create challenge modal ─────────────────────────────────────────── */}
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
              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. March 200km"
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

              <div>
                <label className="block text-xs font-bold text-[#6b7280] mb-1.5">
                  Group target ({unit === 'miles' ? 'miles' : 'km'}) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.targetDist}
                  onChange={e => setForm(f => ({ ...f, targetDist: e.target.value }))}
                  placeholder={unit === 'miles' ? '150' : '200'}
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>

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
    </main>
  )
}
