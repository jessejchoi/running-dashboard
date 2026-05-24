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

  return (
    <>
      <Nav />
      {primaryGroupId && <PrefetchGroup groupId={primaryGroupId} />}
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">

        {/* ── PAGE HERO ─────────────────────────────────────────────── */}
        <div
          className="mb-8 fade-up grid gap-6 items-end pb-6"
          style={{ borderBottom: '2px solid var(--fg-1)', gridTemplateColumns: 'minmax(0,1fr) auto' }}
        >
          <div>
            <h1
              className="font-display font-bold uppercase"
              style={{
                fontSize: 'clamp(48px, 8vw, 96px)',
                letterSpacing: '-0.04em',
                lineHeight: 0.88,
              }}
            >
              {firstName}
              <span style={{ color: 'var(--magenta)' }}>.</span>
            </h1>
            <p className="font-mono text-[10px] sm:text-xs mt-3 uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>
              {format(new Date(), 'EEE, MMM d').toUpperCase()} · {activities.length} RUNS TRACKED
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>
              SESSION · #{String(activities.length).padStart(5, '0')}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mt-1" style={{ color: 'var(--acid)' }}>
              SIGNAL UP
            </div>
          </div>
        </div>

        {/* ── BENTO ROW 1: Weekly hero + 2×2 mini stats ─────────────── */}
        <div className="grid grid-cols-12 gap-3 mb-3">
          <div className="col-span-12 md:col-span-7 card pulse-bar fade-up" style={{ padding: '1.25rem' }}>
            <p className="pulse-label" style={{ display: 'block', marginBottom: '0.5rem' }}>WEEKLY DISTANCE</p>
            <div
              className="stat-num font-display font-bold leading-none stat-stamp"
              style={{ fontSize: 'clamp(48px, 6vw, 80px)', textShadow: '4px 4px 0 var(--magenta)' }}
            >
              {formatDistanceShort(weekDist, unit).split(' ')[0]}
              <span className="font-bold ml-2" style={{ fontSize: '0.32em', color: 'var(--magenta)', textShadow: 'none', letterSpacing: '0.04em' }}>{unitLabel.toUpperCase()}</span>
            </div>
            <div style={{ height: 140, marginTop: '1.5rem' }}>
              <WeeklyMileageChart activities={activities} />
            </div>
          </div>

          <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-3">
            {[
              { label: 'WEEK RUNS',  value: `${weekActivities.length}`, unit: 'RUNS', bar: 'acid' as const, tone: 'var(--acid)' },
              { label: 'WEEK TIME',  value: weekTime > 0 ? formatDuration(weekTime) : '--', unit: '', bar: 'magenta' as const, tone: 'var(--fg-1)' },
              { label: 'THIS YEAR',  value: formatDistanceShort(yearDist, unit).split(' ')[0], unit: unitLabel.toUpperCase(), bar: 'ice' as const, tone: 'var(--ice)' },
              { label: 'ACTIVITIES', value: `${activities.filter((a: any) => new Date(a.start_date) >= yearStart).length}`, unit: 'THIS YR', bar: 'magenta' as const, tone: 'var(--fg-1)' },
            ].map((s, i) => (
              <div
                key={i}
                className={`card pulse-bar ${s.bar === 'acid' ? 'acid' : s.bar === 'ice' ? 'ice' : ''} fade-up`}
                style={{ animationDelay: `${60 + i * 50}ms`, padding: '1rem' }}
              >
                <p className="pulse-label" style={{ display: 'block', marginBottom: '0.625rem' }}>{s.label}</p>
                <div className="stat-num font-display font-bold leading-none" style={{ fontSize: 36, color: s.tone }}>
                  {s.value}
                  {s.unit && <span className="font-bold ml-1" style={{ fontSize: '0.4em', color: 'var(--fg-3)' }}>{s.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Training load ──────────────────────────────────────────── */}
        {trainingLoad.length > 0 && (
          <div className="card pulse-bar ice fade-up mb-3" style={{ padding: '1.25rem' }}>
            <p className="pulse-label" style={{ marginBottom: '0.75rem' }}>TRAINING LOAD · 90 DAYS</p>
            <div style={{ height: 160 }}>
              <TrainingLoadChart data={trainingLoad} days={90} />
            </div>
          </div>
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
