'use client'
import { useState, useEffect, useRef } from 'react'
import { Target, Activity, BarChart2, CalendarDays, Banknote } from 'lucide-react'
import { type Group, type Member, type Run, type LeaderboardRun, type Challenge, type TrainingLoad } from '@/components/GroupShared'
import GroupDashboardTab from '@/components/GroupDashboardTab'
import GroupFeedTab from '@/components/GroupFeedTab'
import GroupPlansTab from '@/components/GroupPlansTab'
import GroupGoalsTab from '@/components/GroupGoalsTab'
import GroupPageHeader from '@/components/GroupPageHeader'
import { GroupBetsTab } from '@/components/GroupBets'
import type { BriefingContent } from '@/lib/coachOutputs'

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
  initialBriefing, initialBriefingMeta, initialAwards, initialPlans, memberEstimates: initialMemberEstimates = {},
}: Props) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'dashboard' | 'feed' | 'goals' | 'plans' | 'bets'>('dashboard')
  const memberEstimates = initialMemberEstimates

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
    <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
      <GroupPageHeader
        allGroups={allGroups}
        copied={copied}
        copyInvite={copyInvite}
        groupCreatedAt={group.created_at}
        groupId={group.id}
        groupName={groupName}
        inviteUrl={inviteUrl}
        localMemberCount={localMembers.length}
        myRole={myRole}
        onRenameChange={setRenameValue}
        onSaveGroupName={saveGroupName}
        renameLoading={renameLoading}
        renameValue={renameValue}
        renamingGroup={renamingGroup}
        setRenamingGroup={setRenamingGroup}
        setRenameValue={setRenameValue}
        setSwitcherOpen={setSwitcherOpen}
        switcherOpen={switcherOpen}
        switcherRef={switcherRef}
      />

      {/* Tab bar */}
      <div
        className="mb-6 overflow-x-auto border-b-2 pb-0 fade-up scrollbar-none sm:mb-8"
        style={{ borderColor: 'var(--fg-1)' }}
      >
        <div className="flex min-w-max gap-2">
          {([
            { key: 'dashboard', label: 'Home',  icon: BarChart2, idx: '01' },
            { key: 'goals',     label: 'Goals', icon: Target, idx: '02' },
            { key: 'bets',      label: 'Bets',  icon: Banknote, idx: '03' },
            { key: 'feed',      label: 'Runs',  icon: Activity, idx: '04' },
            { key: 'plans',     label: 'Plans', icon: CalendarDays, idx: '05' },
          ] as const).map(({ key, label: tabLabel, icon: Icon, idx }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex min-h-[44px] items-center gap-2 border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-colors"
                style={{
                  background: active ? 'var(--magenta)' : 'var(--ink-1)',
                  borderColor: active ? 'var(--magenta)' : 'var(--hair-2)',
                  color: active ? 'var(--ink)' : 'var(--fg-3)',
                }}
              >
                <Icon size={13} />
                <span style={{ color: active ? 'var(--ink)' : 'var(--fg-4)' }}>[{idx}]</span>
                {tabLabel}
              </button>
            )
          })}
        </div>
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
        <GroupGoalsTab
          members={localMembers}
          memberEstimates={memberEstimates}
          myAthleteId={myAthleteId}
        />
      )}

      {/* ── Bets tab ──────────────────────────────────────────────────────── */}
      {tab === 'bets' && (
        <GroupBetsTab
          groupId={group.id}
          members={localMembers}
          myRole={myRole}
        />
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
