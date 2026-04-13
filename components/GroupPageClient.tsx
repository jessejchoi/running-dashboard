'use client'
import { useState, useEffect, useRef } from 'react'
import { Target, Activity, BarChart2, CalendarDays } from 'lucide-react'
import { type Group, type Member, type Run, type LeaderboardRun, type Challenge, type TrainingLoad } from '@/components/GroupShared'
import GroupDashboardTab from '@/components/GroupDashboardTab'
import GroupFeedTab from '@/components/GroupFeedTab'
import GroupPlansTab from '@/components/GroupPlansTab'
import GroupGoalsTab from '@/components/GroupGoalsTab'
import GroupPageHeader from '@/components/GroupPageHeader'
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
  const [tab, setTab] = useState<'dashboard' | 'feed' | 'goals' | 'plans'>('dashboard')
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
      <div className="flex gap-0 mb-6 border-b border-[#1c1c1c] fade-up">
        {([
          { key: 'dashboard', label: 'Home',  icon: BarChart2 },
          { key: 'goals',     label: 'Goals', icon: Target },
          { key: 'feed',      label: 'Runs',  icon: Activity },
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
        <GroupGoalsTab
          members={localMembers}
          memberEstimates={memberEstimates}
          myAthleteId={myAthleteId}
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
