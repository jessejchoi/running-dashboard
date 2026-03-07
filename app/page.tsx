import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import WeeklyMileageChart from '@/components/WeeklyMileageChart'
import PaceTrendChart from '@/components/PaceTrendChart'
import GoalsSection from '@/components/GoalsSection'
import TrainingLoadChart from '@/components/TrainingLoadChart'
import RunTypeBadge from '@/components/RunTypeBadge'
import { formatDuration, speedToPace, isoWeek } from '@/lib/utils'
import { calculateTrainingLoad } from '@/lib/strava'
import { analyzeIntervalSession, analyzeThresholdSession } from '@/lib/analysis'
import Link from 'next/link'
import { format } from 'date-fns'
import { type UserGoal } from '@/lib/goals'

export const dynamic = 'force-dynamic'

async function getData(athleteId: number) {
  const [{ data: activities }, { data: qualityRuns }, { data: tokenData }, { data: goalsData }] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('type', 'Run').order('start_date', { ascending: false }).limit(300),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['interval_5k', 'threshold']).order('start_date', { ascending: false }).limit(20),
    supabaseAdmin.from('strava_tokens').select('athlete_data').eq('athlete_id', athleteId).single(),
    supabaseAdmin.from('user_goals').select('*').eq('athlete_id', athleteId).order('race_date', { ascending: true }),
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
  }
}

export default async function DashboardPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value

  if (!athleteId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-center fade-up">
          <h1 className="font-display font-extrabold text-5xl mb-3">
            <span className="text-[#f97316]">RUN</span>DASH
          </h1>
          <p className="text-[#6b7280] text-lg max-w-sm">
            Your personal running dashboard. Connect Strava to start tracking your training.
          </p>
        </div>
        <Link
          href="/api/auth/strava"
          className="flex items-center gap-3 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold px-8 py-4 rounded-xl transition-colors text-base"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Connect with Strava
        </Link>
        <p className="text-[#4b5563] text-xs max-w-xs text-center">
          Read-only access to your activities. No posting or data modification.
        </p>
      </div>
    )
  }

  const { activities, athlete, goals, estimates } = await getData(Number(athleteId))
  const trainingLoad = calculateTrainingLoad(activities)

  const thisWeek = isoWeek(new Date())
  const weekActivities = activities.filter((a: any) => isoWeek(new Date(a.start_date)) === thisWeek)
  const weekKm = weekActivities.reduce((s: number, a: any) => s + a.distance / 1000, 0)
  const weekTime = weekActivities.reduce((s: number, a: any) => s + a.moving_time, 0)
  const allKm = activities.reduce((s: number, a: any) => s + a.distance / 1000, 0)
  const recentRuns = activities.slice(0, 5)

  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="flex items-center justify-between mb-8 fade-up">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'This week', value: `${weekKm.toFixed(1)}`, unit: 'km' },
            { label: 'Week runs', value: `${weekActivities.length}`, unit: 'runs' },
            { label: 'Week time', value: weekTime > 0 ? formatDuration(weekTime) : '--', unit: '' },
            { label: 'Total km', value: `${Math.round(allKm)}`, unit: 'km' },
          ].map((s, i) => (
            <div key={i} className="card fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="text-[#6b7280] text-xs mb-2">{s.label}</div>
              <div className="stat-num text-2xl font-bold text-white">
                {s.value}
                {s.unit && <span className="text-sm text-[#6b7280] ml-1">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="card fade-up">
            <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest mb-4">
              Weekly Mileage
            </h2>
            <WeeklyMileageChart activities={activities} />
          </div>
          <div className="card fade-up">
            <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest mb-4">
              Pace Trend
            </h2>
            <PaceTrendChart activities={activities} targetPaceSeconds={270} />
          </div>
        </div>

        {/* Training Load */}
        {trainingLoad.length > 0 && (
          <div className="card mb-8 fade-up">
            <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest mb-4">
              Training Load
            </h2>
            <TrainingLoadChart data={trainingLoad} days={90} />
          </div>
        )}

        {/* Goals */}
        <div className="mb-8">
          <GoalsSection
            initialGoals={goals}
            estimates={Object.fromEntries(
              Object.entries(estimates).filter(([, v]) => v != null)
            ) as Record<string, number>}
          />
        </div>

        {/* Recent runs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Recent Runs</h2>
            <Link href="/runs" className="text-xs text-[#f97316] hover:underline">All runs →</Link>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {['Date', 'Type', 'Distance', 'Pace', 'Time'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[#6b7280] text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run: any) => (
                  <tr key={run.id} className="border-b border-[#1c1c1c] hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3 text-[#6b7280] text-xs font-mono">
                      <Link href={`/runs/${run.id}`} className="hover:text-[#f97316] transition-colors">
                        {format(new Date(run.start_date), 'MMM d')}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><RunTypeBadge type={run.run_type} /></td>
                    <td className="px-4 py-3 font-mono text-[#f97316]">{(run.distance / 1000).toFixed(2)} km</td>
                    <td className="px-4 py-3 font-mono">{speedToPace(run.average_speed)}/km</td>
                    <td className="px-4 py-3 font-mono text-[#6b7280]">{formatDuration(run.moving_time)}</td>
                  </tr>
                ))}
                {recentRuns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#6b7280] text-sm">
                      No runs yet. Sync your Strava activities to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
