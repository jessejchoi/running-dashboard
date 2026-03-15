import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GroupPageClient from '@/components/GroupPageClient'
import { format } from 'date-fns'

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

  const { data: group } = await supabaseAdmin
    .from('groups')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!group) redirect('/')

  // Fetch members
  const { data: members } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id, role, joined_at')
    .eq('group_id', params.id)
    .order('joined_at', { ascending: true })

  const memberIds = (members ?? []).map(m => m.athlete_id)

  // Fetch athlete names/pics from strava_tokens
  const { data: tokens } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id, athlete_name, athlete_profile, athlete_gender')
    .in('athlete_id', memberIds)

  // Fetch goals for all members
  const { data: goals } = await supabaseAdmin
    .from('user_goals')
    .select('athlete_id, id, distance_key, label, target_secs, current_secs, race_date')
    .in('athlete_id', memberIds)
    .order('race_date', { ascending: true })

  // Fetch last 30 days of activities for each member (for run feed + load more)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentRuns } = await supabaseAdmin
    .from('activities')
    .select('id, athlete_id, name, start_date, distance, moving_time, average_speed, average_heartrate, run_type')
    .in('athlete_id', memberIds)
    .gte('start_date', thirtyDaysAgo)
    .order('start_date', { ascending: false })
    .limit(100)

  // Fetch last 6 months of activities for leaderboard + challenge progress
  const sixMonthsAgo = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000).toISOString()
  const { data: leaderboardRuns } = await supabaseAdmin
    .from('activities')
    .select('id, athlete_id, distance, start_date')
    .in('athlete_id', memberIds)
    .gte('start_date', sixMonthsAgo)
    .order('start_date', { ascending: false })

  // Fetch group challenges
  const { data: challenges } = await supabaseAdmin
    .from('group_challenges')
    .select('*')
    .eq('group_id', params.id)
    .order('start_date', { ascending: false })

  // Compose member profiles
  const memberProfiles = (members ?? []).map(m => {
    const token = tokens?.find(t => t.athlete_id === m.athlete_id)
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
    }
  })

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://running-dashboard-three.vercel.app'}/join/${group.invite_code}`

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
      />
    </div>
  )
}
