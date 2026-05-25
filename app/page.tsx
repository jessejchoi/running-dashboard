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
import PrefetchGroup from '@/components/PrefetchGroup'
import { formatDuration, isoWeek, formatDistanceShort, distanceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { calculateTrainingLoad } from '@/lib/strava'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

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
      .select('display_name, max_hr, primary_group_id')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
  ])

  return {
    activities: activities ?? [],
    athlete: tokenData?.athlete_data,
    displayName: userProfile?.display_name ?? null,
    hasMaxHr: !!userProfile?.max_hr,
    primaryGroupId: userProfile?.primary_group_id ?? null,
  }
}

function RaceSectionSkeleton() {
  return (
    <div className="animate-pulse mb-3">
      <div className="card pulse-bar" style={{ padding: '1.25rem' }}>
        <div className="h-3 w-28 mb-4" style={{ background: 'var(--ink-2)' }} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border" style={{ borderColor: 'var(--hair-2)' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24" style={{ background: 'var(--ink-1)', borderRight: i < 3 ? '1px solid var(--hair-2)' : 'none' }} />
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-24" style={{ background: 'var(--ink-2)' }} />
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

  const { activities, athlete, displayName, hasMaxHr, primaryGroupId } = await getFastData(Number(athleteId))
  const trainingLoad = calculateTrainingLoad(activities)

  const thisWeek = isoWeek(new Date())
  const weekActivities = activities.filter((a: any) => isoWeek(new Date(a.start_date)) === thisWeek)
  const weekDist = weekActivities.reduce((s: number, a: any) => s + a.distance, 0)
  const weekTime = weekActivities.reduce((s: number, a: any) => s + a.moving_time, 0)
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearDist = activities.filter((a: any) => new Date(a.start_date) >= yearStart).reduce((s: number, a: any) => s + a.distance, 0)
  const unitLabel = distanceUnitLabel(unit)
  const firstName = (displayName ?? athlete?.firstname ?? 'Runner').split(' ')[0]

  const yearRuns = activities.filter((a: any) => new Date(a.start_date) >= yearStart).length
  const currentYear = new Date().getFullYear()

  const miniStats: Array<{
    idx: string
    label: string
    value: string
    unit?: string
    stripe: '' | 'ice'
  }> = [
    { idx: '02', label: `RUNS · WEEK`,   value: `${weekActivities.length}`,                              stripe: ''    },
    { idx: '03', label: `TIME · WEEK`,   value: weekTime > 0 ? formatDuration(weekTime) : '—',          stripe: ''    },
    { idx: '04', label: `DIST · ${currentYear}`, value: formatDistanceShort(yearDist, unit).split(' ')[0], unit: unitLabel.toUpperCase(), stripe: 'ice' },
    { idx: '05', label: `RUNS · ${currentYear}`, value: `${yearRuns}`,                                  stripe: 'ice' },
  ]

  return (
    <>
      <Nav />
      {primaryGroupId && <PrefetchGroup groupId={primaryGroupId} />}
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">

        {/* ── PAGE HERO ─────────────────────────────────────────────── */}
        <header className="mb-10 sm:mb-14 fade-up pb-6 sm:pb-8" style={{ borderBottom: '2px solid var(--fg-1)' }}>
          <h1
            className="font-display font-bold uppercase"
            style={{
              fontSize: 'clamp(48px, 8vw, 96px)',
              letterSpacing: '-0.035em',
              lineHeight: 0.9,
            }}
          >
            {firstName}
            <span
              style={{
                color: 'var(--magenta)',
                textShadow: '2px 2px 0 var(--magenta-shadow)',
              }}
            >
              .
            </span>
          </h1>
          <p className="font-mono text-[10px] sm:text-[11px] mt-4 uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>
            <span style={{ color: 'var(--magenta)' }}>/ </span>
            {format(new Date(), 'EEE · MMM d · yyyy').toUpperCase()}
            <span className="mx-2" style={{ color: 'var(--fg-4)' }}>·</span>
            {activities.length} RUNS TRACKED
          </p>
        </header>

        {/* ── SECTION · THIS WEEK ───────────────────────────────────── */}
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="pulse-label">THIS WEEK</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--fg-4)' }}>
            WK {isoWeek(new Date())}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-[14px] mb-8 sm:mb-10">
          {/* Hero weekly distance */}
          <div className="col-span-12 md:col-span-7 card pulse-bar fade-up">
            <span className="card-index">[01]</span>
            <p className="pulse-label" style={{ display: 'block' }}>WEEKLY DISTANCE</p>
            <div className="mt-4 sm:mt-5 flex items-end gap-3">
              <div
                className="stat-num font-display font-bold stat-stamp"
                style={{
                  fontSize: 'clamp(56px, 7vw, 80px)',
                  letterSpacing: '-0.035em',
                  lineHeight: 0.9,
                }}
              >
                {formatDistanceShort(weekDist, unit).split(' ')[0]}
              </div>
              <span
                className="pb-2 font-mono uppercase tracking-[0.18em] text-[11px]"
                style={{ color: 'var(--fg-3)' }}
              >
                {unitLabel}
              </span>
            </div>
            <div style={{ height: 140, marginTop: '1.5rem' }}>
              <WeeklyMileageChart activities={activities} />
            </div>
          </div>

          {/* 2×2 mini stats */}
          <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-[14px]">
            {miniStats.map((s, i) => (
              <div
                key={s.idx}
                className={`card pulse-bar ${s.stripe} fade-up`}
                style={{ animationDelay: `${60 + i * 50}ms` }}
              >
                <span className="card-index">[{s.idx}]</span>
                <p className="pulse-label" style={{ display: 'block' }}>{s.label}</p>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <div
                    className="stat-num font-display font-bold"
                    style={{
                      fontSize: 'clamp(32px, 4.2vw, 40px)',
                      letterSpacing: '-0.025em',
                      lineHeight: 0.95,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {s.value}
                  </div>
                  {s.unit && (
                    <span
                      className="font-mono uppercase tracking-[0.16em] text-[10px]"
                      style={{ color: 'var(--fg-3)' }}
                    >
                      {s.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION · TRAINING ────────────────────────────────────── */}
        {trainingLoad.length > 0 && (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="pulse-label">TRAINING</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--fg-4)' }}>
                90 DAYS
              </span>
            </div>
            <div className="card pulse-bar ice fade-up mb-8 sm:mb-10">
              <span className="card-index">[06]</span>
              <p className="pulse-label" style={{ display: 'block' }}>TRAINING LOAD</p>
              <div style={{ height: 160, marginTop: '1.25rem' }}>
                <TrainingLoadChart data={trainingLoad} days={90} />
              </div>
            </div>
          </>
        )}

        <WeeklyPlanCard unit={unit} />

        <Suspense fallback={<RaceSectionSkeleton />}>
          <DashboardRaceSection athleteId={Number(athleteId)} unit={unit} hasMaxHr={hasMaxHr} />
        </Suspense>

        <RecentRunsCard runs={activities.slice(0, 3) as any} unit={unit} />

      </main>
    </>
  )
}
