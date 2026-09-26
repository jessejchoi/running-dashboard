import { getAthleteId } from '@/lib/auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GroupPageClient from '@/components/GroupPageClient'
import { format } from 'date-fns'
import { calculateTrainingLoad, TRAINING_LOAD_COLUMNS } from '@/lib/strava'
import { getGroupLatestEstimates } from '@/lib/latestEstimates'
import { addDays, localDate, validTimezone, DEFAULT_TIMEZONE } from '@/lib/calendar'
import type { BriefingContent } from '@/lib/coachOutputs'

export const dynamic = 'force-dynamic'

function formatGoalTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default async function GroupPage({ params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) redirect('/')

  const myId = parseInt(athleteId)

  // Batch 1: everything keyed only by group or viewer. Membership is derived
  // from the member list, so it doesn't need its own round trip first.
  const [
    { data: group },
    { data: allMemberships },
    { data: members },
    { data: challenges },
    { data: briefingRow },
    { data: myProfile },
  ] = await Promise.all([
    supabaseAdmin.from('groups').select('*').eq('id', params.id).maybeSingle(),
    supabaseAdmin.from('group_members').select('group_id').eq('athlete_id', myId),
    supabaseAdmin
      .from('group_members')
      .select('athlete_id, role, joined_at')
      .eq('group_id', params.id)
      .order('joined_at', { ascending: true }),
    supabaseAdmin
      .from('group_challenges')
      .select('*')
      .eq('group_id', params.id)
      .order('start_date', { ascending: false }),
    supabaseAdmin
      .from('group_coach_briefings')
      .select('content_json, generated_at')
      .eq('group_id', params.id)
      .maybeSingle(),
    supabaseAdmin
      .from('user_profiles')
      .select('primary_group_id, timezone')
      .eq('athlete_id', myId)
      .maybeSingle(),
  ])

  const myMembership = (members ?? []).find(m => m.athlete_id === myId)
  if (!myMembership) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Nav />
        <div className="text-4xl mb-2">🔒</div>
        <h1 className="font-display font-bold text-2xl">Not a member</h1>
        <p className="text-[#6b7280] text-sm">You need an invite link to join this group.</p>
        <a href="/" className="text-[#f97316] text-sm hover:underline">Back to dashboard</a>
      </div>
    )
  }

  if (!group) redirect('/')

  const allGroupIds = (allMemberships ?? []).map(m => m.group_id)
  const memberIds = (members ?? []).map(m => m.athlete_id)

  // Batch 2: all member-dependent data in parallel
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixMonthsAgo = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000).toISOString()
  // The viewer's own date; each member's runs count on the day they ran them.
  const todayStr = localDate(new Date(), validTimezone(myProfile?.timezone) ? myProfile.timezone : DEFAULT_TIMEZONE)

  const [
    { data: allGroupsRaw },
    { data: tokens },
    { data: memberProfilesData },
    { data: goals },
    { data: recentRuns },
    { data: leaderboardRuns },
    trainingLoadRunsByMember,
    memberEstimates,
  ] = await Promise.all([
    allGroupIds.length > 0
      ? supabaseAdmin.from('groups').select('id, name').in('id', allGroupIds)
      : Promise.resolve({ data: [] }),
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_id, athlete_name, athlete_profile, athlete_gender')
      .in('athlete_id', memberIds),
    supabaseAdmin
      .from('user_profiles')
      .select('athlete_id, status_tag, max_hr')
      .in('athlete_id', memberIds),
    supabaseAdmin
      .from('user_goals')
      .select('athlete_id, id, distance_key, label, target_secs, current_secs, race_date, status, result_secs')
      .in('athlete_id', memberIds)
      .order('race_date', { ascending: true }),
    supabaseAdmin
      .from('activities')
      .select('id, athlete_id, name, start_date, start_date_local, distance, moving_time, average_speed, average_heartrate, run_type')
      .in('athlete_id', memberIds)
      .gte('start_date', thirtyDaysAgo)
      .order('start_date', { ascending: false })
      .limit(100),
    supabaseAdmin.rpc('group_daily_context',{p_athletes:memberIds,p_from:new Date(Math.min(Date.parse(sixMonthsAgo),Date.parse(addDays(todayStr.slice(0,4)+'-01-01',-1)+'T00:00:00Z'))).toISOString(),p_to:new Date().toISOString()}),
    Promise.all(
      memberIds.map(async memberId => {
        const { data } = await supabaseAdmin
          .from('activities')
          .select(TRAINING_LOAD_COLUMNS)
          .eq('athlete_id', memberId)
          .eq('type', 'Run')
          .order('start_date', { ascending: false })
          .limit(200)

        return { memberId, runs: data ?? [] }
      })
    ),
    // Read latest estimates from user_latest_estimates (single source of truth)
    getGroupLatestEstimates(memberIds),
  ])

  const allGroups = (allGroupsRaw ?? []).map(g => ({ id: g.id as string, name: g.name as string }))

  // Compute current training load (ATL/CTL/TSB) for each member
  const memberTrainingLoads: Record<number, { ctl: number; atl: number; tsb: number }> = {}
  for (const { memberId, runs } of trainingLoadRunsByMember) {
    const maxHr = memberProfilesData?.find(p => p.athlete_id === memberId)?.max_hr ?? null
    const loadPoints = calculateTrainingLoad(runs, { maxHr })
    const latest = loadPoints[loadPoints.length - 1]
    memberTrainingLoads[memberId] = latest
      ? { ctl: latest.ctl, atl: latest.atl, tsb: latest.tsb }
      : { ctl: 0, atl: 0, tsb: 0 }
  }

  // Compose member profiles
  const memberProfiles = (members ?? []).map(m => {
    const token = tokens?.find(t => t.athlete_id === m.athlete_id)
    const profile = memberProfilesData?.find(p => p.athlete_id === m.athlete_id)
    const memberGoals = (goals ?? []).filter(g => g.athlete_id === m.athlete_id)
    return {
      athlete_id: m.athlete_id,
      role: m.role,
      joined_at: m.joined_at,
      name: token?.athlete_name ?? `Athlete ${m.athlete_id}`,
      profile_pic: token?.athlete_profile ?? null,
      gender: token?.athlete_gender ?? null,
      goals: memberGoals,
      is_me: m.athlete_id === myId,
      status_tag: profile?.status_tag ?? null,
    }
  })

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://running-dashboard-three.vercel.app'}/join/${group.invite_code}`

  const initialBriefing = briefingRow ? (briefingRow.content_json as BriefingContent) : null
  const initialBriefingMeta = briefingRow
    ? { cached: true, generated_at: briefingRow.generated_at as string }
    : null

  return (
    <div className="min-h-screen">
      <Nav />
      <GroupPageClient
        group={group}
        members={memberProfiles}
        recentRuns={recentRuns ?? []}
        leaderboardRuns={leaderboardRuns ?? []}
        initialChallenges={challenges ?? []}
        myRole={myMembership.role}
        inviteUrl={inviteUrl}
        myAthleteId={myId}
        isPrimaryGroup={myProfile?.primary_group_id === params.id}
        memberTrainingLoads={memberTrainingLoads}
        allGroups={allGroups}
        initialBriefing={initialBriefing}
        initialBriefingMeta={initialBriefingMeta}
        memberEstimates={memberEstimates}
        today={todayStr}
      />
    </div>
  )
}
