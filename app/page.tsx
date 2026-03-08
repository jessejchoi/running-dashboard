import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import OnboardingPage from '@/components/OnboardingPage'
import WeeklyMileageChart from '@/components/WeeklyMileageChart'
import GoalsSection from '@/components/GoalsSection'
import TrainingLoadChart from '@/components/TrainingLoadChart'
import RunTypeBadge from '@/components/RunTypeBadge'
import { formatDuration, speedToPace, isoWeek, toJakartaDate } from '@/lib/utils'
import { calculateTrainingLoad } from '@/lib/strava'
import { analyzeIntervalSession, analyzeThresholdSession } from '@/lib/analysis'
import Link from 'next/link'
import GroupLeaderboard from '@/components/GroupLeaderboard'
import GroupFeed from '@/components/GroupFeed'
import GroupGoalsSection from '@/components/GroupGoalsSection'
import { format } from 'date-fns'
import { type UserGoal } from '@/lib/goals'

export const dynamic = 'force-dynamic'

async function getData(athleteId: number) {
  const [
    { data: activities },
    { data: qualityRuns },
    { data: tokenData },
    goalsData,
    { data: membership },
  ] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('type', 'Run').order('start_date', { ascending: false }).limit(400),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['interval_5k', 'threshold']).order('start_date', { ascending: false }).limit(20),
    supabaseAdmin.from('strava_tokens').select('athlete_data').eq('athlete_id', athleteId).single(),
    supabaseAdmin.from('user_goals').select('*').eq('athlete_id', athleteId).order('race_date', { ascending: true }).then(r => r.data ?? []).catch(() => []),
    supabaseAdmin.from('group_members').select('group_id').eq('athlete_id', athleteId).limit(1),
  ])

  // Compute most recent 5K estimate from interval + threshold sessions
  const estimates = (qualityRuns ?? [])
    .map((a: any) => a.run_type === 'interval_5k' ? analyzeIntervalSession(a) : analyzeThresholdSession(a))
    .filter(Boolean)
  const latest5KSecs = estimates.length > 0
    ? estimates.sort((a: any, b: any) => b.date.localeCompare(a.date))[0]!.estimatedSecs
    : null

  // Riegel extrapolation for longer races: t2 = t1 × (d2/d1)^1.06
  const riegelFrom5K = (d2km: number) =>
    latest5KSecs ? latest5KSecs * Math.pow(d2km / 5, 1.06) : null

  // ── Group data ────────────────────────────────────────────
  // Fetch the first group this athlete belongs to (if any)
  const groupData = await (async () => {
    try {
      if (!membership?.length) return null

      const groupId = membership[0].group_id

      const [{ data: group }, { data: allMembers }] = await Promise.all([
        supabaseAdmin.from('groups').select('id, name').eq('id', groupId).single(),
        supabaseAdmin.from('group_members').select('athlete_id, role').eq('group_id', groupId),
      ])

      if (!group) return null

      const memberIds = (allMembers ?? []).map((m: any) => m.athlete_id)

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

      const otherMemberIds = memberIds.filter((id: number) => id !== athleteId)

      // Fetch profiles, activities, and other members' goals all in parallel
      const [{ data: tokens }, { data: groupActivities }, { data: otherGoalsData }] = await Promise.all([
        supabaseAdmin.from('strava_tokens').select('athlete_id, athlete_name, athlete_profile').in('athlete_id', memberIds),
        supabaseAdmin.from('activities').select('id, athlete_id, name, start_date, distance, moving_time, average_speed, average_heartrate, run_type').in('athlete_id', memberIds).gte('start_date', weekStartIso).order('start_date', { ascending: false }).limit(50),
        otherMemberIds.length > 0
          ? supabaseAdmin.from('user_goals').select('*').in('athlete_id', otherMemberIds)
          : Promise.resolve({ data: [] }),
      ])

      // Compute per-member stats
      const members = memberIds.map((aid: number) => {
        const token = tokens?.find((t: any) => t.athlete_id === aid)
        const memberRuns = (groupActivities ?? []).filter((a: any) => a.athlete_id === aid)

        // This week km (all memberRuns are already filtered to this week from the query)
        const weekKm = memberRuns
          .reduce((s: number, a: any) => s + a.distance / 1000, 0)

        // Streak: consecutive days with a run going back from today
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

        // Last run days ago
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
        }
      })

      // Member map for feed
      const memberMap = Object.fromEntries(
        members.map((m: any) => [m.athlete_id, { name: m.name, profile_pic: m.profile_pic, is_me: m.is_me }])
      )

      const memberGoals = (otherGoalsData ?? []).map((g: any) => ({
        ...g,
        athlete_name: members.find((m: any) => m.athlete_id === g.athlete_id)?.name ?? 'Member',
        athlete_profile: members.find((m: any) => m.athlete_id === g.athlete_id)?.profile_pic ?? null,
      }))

      return {
        group,
        members,
        memberMap,
        feedRuns: groupActivities ?? [],
        memberGoals,
      }
    } catch {
      return null
    }
  })()

  return {
    activities: activities ?? [],
    athlete: tokenData?.athlete_data,
    goals: (goalsData ?? []) as UserGoal[],
    estimates: {
      '5k':  latest5KSecs,
      '10k': riegelFrom5K(10),
      'hm':  riegelFrom5K(21.097),
      'fm':  riegelFrom5K(42.195),
    } as Record<string, number | null>,
    groupData,
  }
}

export default async function DashboardPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value

  if (!athleteId) {
    return <OnboardingPage />
  }

  const { activities, athlete, goals, estimates, groupData } = await getData(Number(athleteId))
  const trainingLoad = calculateTrainingLoad(activities)

  const thisWeek = isoWeek(new Date())
  const weekActivities = activities.filter((a: any) => isoWeek(new Date(a.start_date)) === thisWeek)
  const weekKm = weekActivities.reduce((s: number, a: any) => s + a.distance / 1000, 0)
  const weekTime = weekActivities.reduce((s: number, a: any) => s + a.moving_time, 0)
  const allKm = activities.reduce((s: number, a: any) => s + a.distance / 1000, 0)
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearKm = activities.filter((a: any) => new Date(a.start_date) >= yearStart).reduce((s: number, a: any) => s + a.distance / 1000, 0)
  const recentRuns = activities.slice(0, 5)

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-14 sm:pt-20 pb-16">
        <div className="flex items-center justify-between mb-4 fade-up">
          <div>
            <h1 className="font-display font-extrabold text-3xl leading-normal pb-1">
              Hey, {athlete?.firstname ?? 'Runner'} 👋
            </h1>
            <p className="text-[#6b7280] text-sm mt-1">
              {format(new Date(), 'EEEE, MMMM d')} · {activities.length} runs tracked
            </p>
          </div>
        </div>

        {/* Top stats */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">My Stats</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'This week', value: `${weekKm.toFixed(1)}`, unit: 'km' },
            { label: 'Week runs', value: `${weekActivities.length}`, unit: 'runs' },
            { label: 'Week time', value: weekTime > 0 ? formatDuration(weekTime) : '--', unit: '' },
            { label: 'This year', value: `${Math.round(yearKm)}`, unit: 'km' },
          ].map((s, i) => (
            <div key={i} className="card fade-up" style={{ animationDelay: `${i * 60}ms`, padding: '0.75rem 1rem' }}>
              <div className="text-[#6b7280] text-xs mb-1">{s.label}</div>
              <div className="stat-num text-2xl font-bold text-white leading-none">
                {s.value}
                {s.unit && <span className="text-sm text-[#6b7280] ml-1">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="card fade-up" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '300px' }}>
            <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest mb-3" style={{ flexShrink: 0 }}>
              Weekly Mileage
            </h2>
            <div style={{ flex: 1, minHeight: 0 }}>
              <WeeklyMileageChart activities={activities} />
            </div>
          </div>
          {trainingLoad.length > 0 && (
            <div className="card fade-up" style={{ padding: '1rem', height: '300px', display: 'flex', flexDirection: 'column' }}>
              <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest mb-3" style={{ flexShrink: 0 }}>
                Training Load
              </h2>
              <div style={{ flex: 1, minHeight: 0 }}>
                <TrainingLoadChart data={trainingLoad} days={90} />
              </div>
            </div>
          )}
        </div>

        {/* Group Stats */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">Group Stats</h2>
        </div>
        {groupData ? (
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <GroupLeaderboard
              members={groupData.members}
              groupId={groupData.group.id}
              groupName={groupData.group.name}
            />
            <GroupFeed
              runs={groupData.feedRuns}
              memberMap={groupData.memberMap}
              myAthleteId={Number(athleteId)}
              groupId={groupData.group.id}
            />
          </div>
        ) : (
          <div className="card fade-up mb-8 flex flex-col items-center justify-center text-center gap-4" style={{ paddingTop: 40, paddingBottom: 40 }}>
            <div className="w-12 h-12 rounded-full bg-[#f97316]/10 flex items-center justify-center">
              <span className="text-2xl">🏃</span>
            </div>
            <div>
              <p className="font-bold text-white mb-1">You&apos;re not in a group yet</p>
              <p className="text-[#6b7280] text-sm max-w-xs">Create a group and invite your training partners to run together.</p>
            </div>
            <Link href="/groups" className="flex items-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm" prefetch>
              Create a group
            </Link>
          </div>
        )}

        {/* My Race Goals */}
        <div className="mb-8">
          <GoalsSection
            initialGoals={goals}
            estimates={Object.fromEntries(
              Object.entries(estimates).filter(([, v]) => v != null)
            ) as Record<string, number>}
          />
        </div>

        {/* Group Race Goals */}
        {groupData && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">Group Race Goals</h2>
            </div>
            <GroupGoalsSection memberGoals={groupData.memberGoals} />
          </div>
        )}


      </main>
    </>
  )
}
