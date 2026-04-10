'use client'
import { useState, useEffect, useRef } from 'react'
import { Copy, Check, Users, Target, Activity, BarChart2, CalendarDays, Pencil, X } from 'lucide-react'
import { format } from 'date-fns'
import { paceUnitLabel, distanceUnitLabel } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'
import { Avatar, formatTime, type Group, type Member, type Run, type LeaderboardRun, type Challenge, type TrainingLoad } from '@/components/GroupShared'
import GroupDashboardTab from '@/components/GroupDashboardTab'
import GroupFeedTab from '@/components/GroupFeedTab'
import GroupPlansTab from '@/components/GroupPlansTab'
import GroupRaceEstimatesSection from '@/components/GroupRaceEstimatesSection'
import type { BriefingContent } from '@/app/api/groups/[id]/coach/briefing/route'

interface Goal {
  id: string
  athlete_id: number
  distance_key: string
  label: string
  target_secs: number
  current_secs: number | null
  race_date: string
}

interface Award {
  id: string
  athlete_id: number
  athlete_name: string
  athlete_profile: string | null
  award_key: string
  award_label: string
  emoji: string
  week_start: string
  caption: string | null
}

interface UserPlan {
  id: string
  athlete_id: number
  plan_date: string
  session_index: number
  session_type: string | null
  description: string | null
  target_distance_meters: number | null
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
  memberTrainingLoads: Record<number, TrainingLoad>
  allGroups: { id: string; name: string }[]
  initialBriefing?: BriefingContent | null
  initialBriefingMeta?: { cached: boolean; generated_at: string } | null
  initialAwards?: Award[]
  initialPlans?: UserPlan[]
  memberEstimates?: Record<number, Record<string, number>>   // server-side snapshot cache (initial paint)
}

export default function GroupPageClient({
  group, members, recentRuns, leaderboardRuns, initialChallenges, myRole, inviteUrl, myAthleteId, memberTrainingLoads, allGroups,
  initialBriefing, initialBriefingMeta, initialAwards, initialPlans, memberEstimates = {},
}: Props) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'dashboard' | 'feed' | 'goals' | 'plans'>('dashboard')

  // Group name rename
  const [groupName, setGroupName] = useState(group.name)
  const [renamingGroup, setRenamingGroup] = useState(false)
  const [renameValue, setRenameValue] = useState(group.name)
  const [renameLoading, setRenameLoading] = useState(false)

  // Members (mutable for kick/promote)
  const [localMembers, setLocalMembers] = useState(members)

  // Group switcher
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  const { unit } = useUnit()

  // Save selected group as primary in DB
  useEffect(() => {
    fetch(`/api/groups/${group.id}/select`, { method: 'POST' })
  }, [group.id])

  useEffect(() => {
    if (!switcherOpen) return
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [switcherOpen])

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function saveGroupName() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === groupName) { setRenamingGroup(false); return }
    setRenameLoading(true)
    const res = await fetch(`/api/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    setRenameLoading(false)
    if (res.ok) {
      setGroupName(trimmed)
      setRenamingGroup(false)
    }
  }

  async function kickMember(athleteId: number) {
    if (!confirm('Remove this member from the group?')) return
    const res = await fetch(`/api/groups/${group.id}/members?athleteId=${athleteId}`, { method: 'DELETE' })
    if (res.ok) setLocalMembers(prev => prev.filter(m => m.athlete_id !== athleteId))
  }

  async function updateMemberRole(athleteId: number, role: 'admin' | 'member') {
    const res = await fetch(`/api/groups/${group.id}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_id: athleteId, role }),
    })
    if (res.ok) setLocalMembers(prev => prev.map(m => m.athlete_id === athleteId ? { ...m, role } : m))
  }

  return (
    <main className="standalone-main max-w-4xl mx-auto px-4 pt-8 sm:pt-20 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between mb-3 sm:mb-6 fade-up">
        <div>
          {renamingGroup ? (
            <div className="flex items-center gap-2">
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveGroupName(); if (e.key === 'Escape') setRenamingGroup(false) }}
                autoFocus
                className="font-display font-extrabold uppercase bg-transparent border-b-2 border-[#f97316] outline-none text-white w-full"
              style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}
              />
              <button
                onClick={saveGroupName}
                disabled={renameLoading}
                className="text-xs font-bold text-[#f97316] hover:text-[#ea580c] disabled:opacity-50 shrink-0"
              >
                {renameLoading ? '…' : 'Save'}
              </button>
              <button onClick={() => setRenamingGroup(false)} className="text-[#4b5563] hover:text-white shrink-0">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-display font-extrabold uppercase" style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}>{groupName}</h1>
              {myRole === 'admin' && (
                <button
                  onClick={() => { setRenameValue(groupName); setRenamingGroup(true) }}
                  className="text-[#4b5563] hover:text-white mt-1"
                  title="Rename group"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
          <p className="text-[#6b7280] text-sm mt-1">
            {localMembers.length} member{localMembers.length !== 1 ? 's' : ''} · Created {format(new Date(group.created_at), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allGroups.length > 1 && (
            <div className="relative" ref={switcherRef}>
              <button
                onClick={() => setSwitcherOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#3a3a3a] text-[#6b7280] hover:text-white rounded-lg transition-colors"
              >
                <Users size={12} />
                Switch
              </button>
              {switcherOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                  {allGroups.map(g => (
                    <a
                      key={g.id}
                      href={`/group/${g.id}`}
                      className={`flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors no-underline ${
                        g.id === group.id
                          ? 'text-[#f97316] bg-[#f97316]/10'
                          : 'text-[#9ca3af] hover:text-white hover:bg-[#1c1c1c]'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${g.id === group.id ? 'bg-[#f97316]' : 'bg-[#3a3a3a]'}`} />
                      <span className="truncate">{g.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={copyInvite}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#f97316] text-[#6b7280] hover:text-[#f97316] rounded-lg transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Invite link'}
          </button>
        </div>
      </div>

      {/* Invite banner */}
      {localMembers.length < 2 && (
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
      <div className="flex gap-0 mb-6 border-b border-[#1c1c1c] fade-up">
        {([
          { key: 'dashboard', label: 'Dashboard', icon: BarChart2 },
          { key: 'feed',      label: 'Runs',      icon: Activity },
          { key: 'goals',     label: 'Goals',     icon: Target },
          { key: 'plans',     label: 'Plans',     icon: CalendarDays },
        ] as const).map(({ key, label: tabLabel, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 px-2.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-[#f97316] text-white'
                : 'border-transparent text-[#6b7280] hover:text-white'
            }`}
          >
            <Icon size={13} />
            {tabLabel}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ─────────────────────────────────────────────────── */}
      <div className={tab !== 'dashboard' ? 'hidden' : ''}>
        <GroupDashboardTab
          group={group}
          leaderboardRuns={leaderboardRuns}
          members={localMembers}
          memberTrainingLoads={memberTrainingLoads}
          myRole={myRole}
          myAthleteId={myAthleteId}
          initialChallenges={initialChallenges}
          onKickMember={kickMember}
          onUpdateMemberRole={updateMemberRole}
          initialBriefing={initialBriefing}
          initialBriefingMeta={initialBriefingMeta}
          initialAwards={initialAwards}
        />
      </div>

      {/* ── Feed tab ──────────────────────────────────────────────────────── */}
      <div className={tab !== 'feed' ? 'hidden' : ''}>
        <GroupFeedTab
          groupId={group.id}
          recentRuns={recentRuns}
          members={localMembers}
          myAthleteId={myAthleteId}
        />
      </div>

      {/* ── Goals tab ─────────────────────────────────────────────────────── */}
      {tab === 'goals' && (
        <>
        <div className="space-y-6 fade-up">
          {localMembers.map(m => (
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
                  {m.goals.map((goal: Goal) => {
                    const daysLeft = Math.ceil((new Date(goal.race_date).getTime() - Date.now()) / 86400000)
                    const isPast = daysLeft < 0
                    const km = { '5k': 5, '10k': 10, 'hm': 21.0975, 'fm': 42.195 }[goal.distance_key] ?? 5
                    const targetPace = goal.target_secs / km
                    const paceStr = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
                    const progress = goal.current_secs && goal.current_secs > 0
                      ? Math.min(1, Math.max(0, goal.target_secs / goal.current_secs))
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

        <GroupRaceEstimatesSection groupId={group.id} members={localMembers} initialEstimates={memberEstimates} myAthleteId={myAthleteId} />
        </>
      )}

      {/* ── Plans tab ─────────────────────────────────────────────────────── */}
      <div className={tab !== 'plans' ? 'hidden' : ''}>
        <GroupPlansTab
          group={group}
          members={localMembers}
          myAthleteId={myAthleteId}
          initialPlans={initialPlans}
        />
      </div>
    </main>
  )
}
