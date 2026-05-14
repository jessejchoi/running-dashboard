import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GroupPageClient from '@/components/GroupPageClient'
import { format } from 'date-fns'
import { calculateTrainingLoad } from '@/lib/strava'
import { AWARD_CATEGORIES, isValidAwardKey } from '@/lib/awards'
import { getGroupLatestEstimates } from '@/lib/latestEstimates'
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
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) redirect('/')

  // Verify membership & fetch group
  const { data: myMembership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

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

  // Batch 1: fetch group info, all memberships, members, and challenges in parallel
  const [
    { data: group },
    { data: allMemberships },
    { data: members },
    { data: challenges },
  ] = await Promise.all([
    supabaseAdmin.from('groups').select('*').eq('id', params.id).single(),
    supabaseAdmin.from('group_members').select('group_id').eq('athlete_id', parseInt(athleteId)),
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
  ])

  if (!group) redirect('/')

  const allGroupIds = (allMemberships ?? []).map(m => m.group_id)
  const memberIds = (members ?? []).map(m => m.athlete_id)

  // Batch 2: fetch all member-dependent data and group names in parallel
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixMonthsAgo = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000).toISOString()
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  // Today in Jakarta time (UTC+7) for plans date range
  const jakartaNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const todayStr = jakartaNow.toISOString().slice(0, 10)
  const planEndStr = new Date(jakartaNow.getTime() + 27 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    { data: allGroupsRaw },
    { data: tokens },
    { data: memberProfilesData },
    { data: goals },
    { data: recentRuns },
    { data: leaderboardRuns },
    { data: briefingRow },
    { data: awardsRaw },
    { data: plansRaw },
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
      .select('athlete_id, status_tag')
      .in('athlete_id', memberIds),
    supabaseAdmin
      .from('user_goals')
      .select('athlete_id, id, distance_key, label, target_secs, current_secs, race_date')
      .in('athlete_id', memberIds)
      .order('race_date', { ascending: true }),
    supabaseAdmin
      .from('activities')
      .select('id, athlete_id, name, start_date, distance, moving_time, average_speed, average_heartrate, run_type')
      .in('athlete_id', memberIds)
      .gte('start_date', thirtyDaysAgo)
      .order('start_date', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('activities')
      .select('id, athlete_id, distance, moving_time, start_date, suffer_score, average_speed, run_type, total_elevation_gain, laps, splits')
      .in('athlete_id', memberIds)
      .eq('type', 'Run')
      .gte('start_date', sixMonthsAgo)
      .order('start_date', { ascending: false }),
    supabaseAdmin
      .from('group_coach_briefings')
      .select('content_json, generated_at')
      .eq('group_id', params.id)
      .maybeSingle(),
    supabaseAdmin
      .from('group_member_awards')
      .select('id, athlete_id, award_key, award_label, week_start, caption')
      .eq('group_id', params.id)
      .gte('week_start', fourWeeksAgo)
      .order('week_start', { ascending: false }),
    supabaseAdmin
      .from('user_plans')
      .select('id, athlete_id, plan_date, session_index, session_type, description, target_distance_meters')
      .in('athlete_id', memberIds)
      .gte('plan_date', todayStr)
      .lte('plan_date', planEndStr)
      .order('plan_date', { ascending: true })
      .order('session_index', { ascending: true }),
  ])

  const allGroups = (allGroupsRaw ?? []).map(g => ({ id: g.id as string, name: g.name as string }))

  const trainingLoadRunsByMember = await Promise.all(
    memberIds.map(async memberId => {
      const { data } = await supabaseAdmin
        .from('activities')
        .select('start_date,distance,moving_time,suffer_score')
        .eq('athlete_id', memberId)
        .eq('type', 'Run')
        .order('start_date', { ascending: false })
        .limit(200)

      return { memberId, runs: data ?? [] }
    })
  )

  // Compute current training load (ATL/CTL/TSB) for each member
  const memberTrainingLoads: Record<number, { ctl: number; atl: number; tsb: number }> = {}
  for (const { memberId, runs } of trainingLoadRunsByMember) {
    const loadPoints = calculateTrainingLoad(runs)
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
      is_me: m.athlete_id === parseInt(athleteId),
      status_tag: profile?.status_tag ?? null,
    }
  })

  // Read latest estimates from user_latest_estimates (single source of truth)
  const memberEstimates = await getGroupLatestEstimates(memberIds)

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://running-dashboard-three.vercel.app'}/join/${group.invite_code}`

  // Build token map for awards (reuse already-fetched tokens)
  const tokenMap: Record<number, { name: string; profile_pic: string | null }> = Object.fromEntries(
    (tokens ?? []).map(t => [t.athlete_id, { name: t.athlete_name, profile_pic: t.athlete_profile ?? null }])
  )
  const initialAwards = (awardsRaw ?? []).map(a => ({
    id: a.id as string,
    athlete_id: a.athlete_id as number,
    athlete_name: tokenMap[a.athlete_id]?.name ?? `Athlete ${a.athlete_id}`,
    athlete_profile: tokenMap[a.athlete_id]?.profile_pic ?? null,
    award_key: a.award_key as string,
    award_label: a.award_label as string,
    emoji: isValidAwardKey(a.award_key as string) ? AWARD_CATEGORIES[a.award_key as string].emoji : '🏆',
    week_start: a.week_start as string,
    caption: (a.caption as string | null) ?? null,
  }))

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
        myAthleteId={parseInt(athleteId)}
        memberTrainingLoads={memberTrainingLoads}
        allGroups={allGroups}
        initialBriefing={initialBriefing}
        initialBriefingMeta={initialBriefingMeta}
        initialAwards={initialAwards}
        initialPlans={plansRaw ?? []}
        memberEstimates={memberEstimates}
      />
    </div>
  )
}
