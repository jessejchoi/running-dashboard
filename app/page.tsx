import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import OnboardingPage from '@/components/OnboardingPage'
import WeeklyMileageChart from '@/components/WeeklyMileageChart'
import TrainingLoadChart from '@/components/TrainingLoadChart'
import DashboardRaceSection from '@/components/DashboardRaceSection'
import RecentRunsCard from '@/components/RecentRunsCard'
import WeeklyPlanCard from '@/components/WeeklyPlanCard'
import { formatDuration, isoWeek, formatDistanceShort, distanceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { calculateTrainingLoad } from '@/lib/strava'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

/** Fast path: only what's needed for the above-the-fold content. */
async function getFastData(athleteId: number) {
  const [
    { data: activities },
    { data: tokenData },
    { data: userProfile },
  ] = await Promise.all([
    supabaseAdmin
      .from('activities')
      .select('id,start_date,distance,moving_time,suffer_score,run_type,run_type_manual,type,name,average_heartrate,average_speed,average_cadence,total_elevation_gain')
      .eq('athlete_id', athleteId)
      .eq('type', 'Run')
      .order('start_date', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_data')
      .eq('athlete_id', athleteId)
      .single(),
    supabaseAdmin
      .from('user_profiles')
      .select('display_name, max_hr')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
  ])

  return {
    activities: activities ?? [],
    athlete: tokenData?.athlete_data,
    displayName: userProfile?.display_name ?? null,
    hasMaxHr: !!userProfile?.max_hr,
  }
}

/** Skeleton for the race estimates + goals section */
function RaceSectionSkeleton() {
  return (
    <div className="animate-pulse mb-3">
      <div className="card" style={{ padding: '1.25rem' }}>
        <div className="h-3 w-28 bg-[#1c1c1c] rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-[#1c1c1c] rounded-lg" />
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-24 bg-[#1c1c1c] rounded-xl" />
        ))}
      </div>
    </div>
  )
}


export default async function DashboardPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  if (!athleteId) {
    return <OnboardingPage />
  }

  const { activities, athlete, displayName, hasMaxHr } = await getFastData(Number(athleteId))
  const trainingLoad = calculateTrainingLoad(activities)

  const thisWeek = isoWeek(new Date())
  const weekActivities = activities.filter((a: any) => isoWeek(new Date(a.start_date)) === thisWeek)
  const weekDist = weekActivities.reduce((s: number, a: any) => s + a.distance, 0)
  const weekTime = weekActivities.reduce((s: number, a: any) => s + a.moving_time, 0)
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearDist = activities.filter((a: any) => new Date(a.start_date) >= yearStart).reduce((s: number, a: any) => s + a.distance, 0)
  const unitLabel = distanceUnitLabel(unit)

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24">

        {/* Page header */}
        <div className="mb-6 fade-up">
          <h1 className="font-display font-extrabold uppercase leading-none" style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}>
            Hey, {(displayName ?? athlete?.firstname ?? 'Runner').split(' ')[0]} 👋
          </h1>
          <p className="font-mono text-xs mt-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {format(new Date(), 'EEE, MMM d')} · {activities.length} runs tracked
          </p>
        </div>

        {/* ── Bento Row 1: Weekly chart + mini stats ── */}
        <div className="grid grid-cols-12 gap-3 mb-3">

          {/* Weekly Mileage — hero chart card */}
          <div className="col-span-12 md:col-span-7 card glow-orange fade-up" style={{ padding: '1.25rem' }}>
            <div className="flex items-start justify-between mb-1">
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Weekly Distance</p>
            </div>
            <div className="stat-num font-bold leading-none text-white mb-4" style={{ fontSize: 'clamp(32px, 5vw, 44px)' }}>
              {formatDistanceShort(weekDist, unit).split(' ')[0]}
              <span className="font-normal ml-1.5" style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{unitLabel}</span>
            </div>
            <div style={{ height: 160 }}>
              <WeeklyMileageChart activities={activities} />
            </div>
          </div>

          {/* Mini stats — 2×2 */}
          <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-3">
            {[
              { label: 'Week runs',  value: `${weekActivities.length}`, unit: 'runs' },
              { label: 'Week time',  value: weekTime > 0 ? formatDuration(weekTime) : '--', unit: '' },
              { label: 'This year',  value: formatDistanceShort(yearDist, unit).split(' ')[0], unit: unitLabel },
              { label: 'Activities', value: `${activities.filter((a: any) => new Date(a.start_date) >= yearStart).length}`, unit: 'this yr' },
            ].map((s, i) => (
              <div key={i} className="card fade-up" style={{ animationDelay: `${60 + i * 50}ms`, padding: '0.875rem 1rem' }}>
                <p className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                <div className="stat-num text-2xl font-bold leading-none text-white">
                  {s.value}
                  {s.unit && <span className="font-normal ml-1" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Training Load */}
        {trainingLoad.length > 0 && (
          <div className="card fade-up mb-3" style={{ padding: '1.25rem' }}>
            <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Training Load</p>
            <div style={{ height: 160 }}>
              <TrainingLoadChart data={trainingLoad} days={90} />
            </div>
          </div>
        )}

        {/* ── This Week's Plan ── */}
        <WeeklyPlanCard unit={unit} />

        {/* ── Race Goals + Estimates (deferred) ── */}
        <Suspense fallback={<RaceSectionSkeleton />}>
          <DashboardRaceSection athleteId={Number(athleteId)} unit={unit} hasMaxHr={hasMaxHr} />
        </Suspense>

        {/* ── Recent Runs ── */}
        <RecentRunsCard runs={activities.slice(0, 7) as any} unit={unit} />

      </main>
    </>
  )
}
