/**
 * Async server component — deferred via Suspense.
 * Fetches all group data (leaderboard, challenges, goals, messages).
 * Streams into the dashboard independently of the race section.
 */
import { supabaseAdmin } from '@/lib/supabase'
import GroupLeaderboard from '@/components/GroupLeaderboard'
import GroupChallengesCard from '@/components/GroupChallengesCard'
import GroupGoalsSection from '@/components/GroupGoalsSection'
import GroupCoachTab from '@/components/GroupCoachTab'
import GroupMessageBoard from '@/components/GroupMessageBoard'
import Link from 'next/link'
import { type DistanceUnit } from '@/lib/utils'

async function getGroupData(athleteId: number) {
  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('athlete_id', athleteId)

  if (!membership?.length) return []

  const { data: userProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('primary_group_id, group_order')
    .eq('athlete_id', athleteId)
    .maybeSingle()

  // This week's Monday midnight in Jakarta (UTC+7)
  const nowUtc = Date.now()
  const jakartaOffset = 7 * 60 * 60 * 1000
  const nowJakarta = new Date(nowUtc + jakartaOffset)
  const dayOfWeek = nowJakarta.getUTCDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const mondayJakarta = new Date(nowJakarta)
  mondayJakarta.setUTCDate(mondayJakarta.getUTCDate() - daysSinceMonday)
  mondayJakarta.setUTCHours(0, 0, 0, 0)
  const mondayUtc = new Date(mondayJakarta.getTime() - jakartaOffset)
  const weekStartIso = mondayUtc.toISOString()

  const groupOrder: string[] = userProfile?.group_order ?? []
  const primaryGroupId = userProfile?.primary_group_id
  const sortedMemberships = [...membership].sort((a: any, b: any) => {
    const ai = groupOrder.length > 0 ? groupOrder.indexOf(a.group_id) : -1
    const bi = groupOrder.length > 0 ? groupOrder.indexOf(b.group_id) : -1
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    if (a.group_id === primaryGroupId) return -1
    if (b.group_id === primaryGroupId) return 1
    return 0
  })
  const groupIds = sortedMemberships.slice(0, 3).map((m: any) => m.group_id)

  const results = await Promise.all(
    groupIds.map(async (groupId: string) => {
      try {
        const [{ data: group }, { data: allMembers }] = await Promise.all([
          supabaseAdmin.from('groups').select('id, name').eq('id', groupId).single(),
          supabaseAdmin.from('group_members').select('athlete_id, role').eq('group_id', groupId),
        ])

        if (!group) return null

        const memberIds = (allMembers ?? []).map((m: any) => m.athlete_id)
        const otherMemberIds = memberIds.filter((id: number) => id !== athleteId)

        const [{ data: tokens }, { data: groupActivities }, { data: otherGoalsData }, { data: memberStatusData }] = await Promise.all([
          supabaseAdmin.from('strava_tokens').select('athlete_id, athlete_name, athlete_profile').in('athlete_id', memberIds),
          supabaseAdmin.from('activities').select('id, athlete_id, name, start_date, distance, moving_time, average_speed, average_heartrate, run_type').in('athlete_id', memberIds).gte('start_date', weekStartIso).order('start_date', { ascending: false }).limit(50),
          otherMemberIds.length > 0
            ? supabaseAdmin.from('user_goals').select('*').in('athlete_id', otherMemberIds)
            : Promise.resolve({ data: [] }),
          supabaseAdmin.from('user_profiles').select('athlete_id, status_tag').in('athlete_id', memberIds),
        ])

        const members = memberIds.map((aid: number) => {
          const token = tokens?.find((t: any) => t.athlete_id === aid)
          const memberProfile = memberStatusData?.find((p: any) => p.athlete_id === aid)
          const memberRuns = (groupActivities ?? []).filter((a: any) => a.athlete_id === aid)

          const weekKm = memberRuns.reduce((s: number, a: any) => s + a.distance / 1000, 0)

          const runDates = new Set(
            memberRuns.map((a: any) => {
              const d = new Date(new Date(a.start_date).getTime() + 7 * 60 * 60 * 1000)
              return d.toISOString().split('T')[0]
            })
          )
          let streak = 0
          const today = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
          for (let i = 0; i < 7; i++) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            if (runDates.has(d.toISOString().split('T')[0])) streak++
            else if (i > 0) break
          }

          const lastRun = memberRuns[0]
          const lastRunDaysAgo = lastRun
            ? Math.floor((Date.now() - new Date(lastRun.start_date).getTime()) / 86400000)
            : null

          return {
            athlete_id: aid,
            name: token?.athlete_name ?? `Athlete ${aid}`,
            profile_pic: token?.athlete_profile ?? null,
            weekKm: parseFloat(weekKm.toFixed(1)),
            streak,
            lastRunDaysAgo,
            is_me: aid === athleteId,
            status_tag: memberProfile?.status_tag ?? null,
          }
        })

        const memberGoals = (otherGoalsData ?? []).map((g: any) => ({
          ...g,
          athlete_name: members.find((m: any) => m.athlete_id === g.athlete_id)?.name ?? 'Member',
          athlete_profile: members.find((m: any) => m.athlete_id === g.athlete_id)?.profile_pic ?? null,
        }))

        const myRole = allMembers?.find((m: any) => m.athlete_id === athleteId)?.role ?? 'member'
        return { group, members, feedRuns: groupActivities ?? [], memberGoals, myRole }
      } catch {
        return null
      }
    })
  )

  return results.filter(Boolean) as NonNullable<(typeof results)[number]>[]
}

export default async function DashboardGroupSection({
  athleteId,
  unit,
}: {
  athleteId: number
  unit: DistanceUnit
}) {
  const allGroupsData = await getGroupData(athleteId)

  if (allGroupsData.length === 0) {
    return (
      <div className="card fade-up mb-6 flex flex-col items-center justify-center text-center gap-4" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-muted)' }}>
          <span className="text-2xl">🏃</span>
        </div>
        <div>
          <p className="font-bold text-white mb-1">You&apos;re not in a group yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Create a group and invite your training partners to run together.</p>
        </div>
        <Link
          href="/groups"
          className="flex items-center gap-2 text-white font-bold px-5 py-2.5 rounded-lg transition-colors text-sm"
          style={{ background: 'var(--orange)', color: 'var(--ink)' }}
          prefetch
        >
          Create a group
        </Link>
      </div>
    )
  }

  return (
    <>
      {allGroupsData.map((groupData: any) => (
        <div key={groupData.group.id} className="mb-6">
          <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-3">
            {groupData.group.name}
          </h2>
          <div className="mb-3">
            <GroupCoachTab groupId={groupData.group.id} myRole={groupData.myRole} members={groupData.members} minimal />
          </div>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <GroupLeaderboard members={groupData.members} groupId={groupData.group.id} groupName={groupData.group.name} unit={unit} />
            <GroupChallengesCard groupId={groupData.group.id} />
          </div>
          {groupData.memberGoals.length > 0 && (
            <GroupGoalsSection memberGoals={groupData.memberGoals} groupName={groupData.group.name} />
          )}
          <GroupMessageBoard
            groupId={groupData.group.id}
            members={groupData.members.map((m: any) => ({
              athlete_id: m.athlete_id,
              name: m.name,
              profile_pic: m.profile_pic,
              is_me: m.is_me,
            }))}
            myRole={groupData.myRole}
          />
        </div>
      ))}
    </>
  )
}
