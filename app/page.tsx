import BackgroundWork from '@/components/BackgroundWork'
import {canonicalTotals} from '@/lib/coachData'
import {getCoachRangeDefinitions} from '@/lib/coachMetrics'
import { getAthleteId } from '@/lib/auth'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import OnboardingPage from '@/components/OnboardingPage'
import Eyebrow from '@/components/Eyebrow'
import NextRaceBlock from '@/components/NextRaceBlock'
import { WeeklyMileageChart, TrainingLoadChart } from '@/components/DashboardCharts'
import DashboardRaceSection from '@/components/DashboardRaceSection'
import RecentRunsCard from '@/components/RecentRunsCard'
import PrefetchGroup from '@/components/PrefetchGroup'
import { formatDuration, formatDistanceShort, distanceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { calculateTrainingLoad } from '@/lib/strava'
import { addDays, localDate, runDay, validTimezone, weekStart, DEFAULT_TIMEZONE } from '@/lib/calendar'
import { primaryRace, type UserGoal } from '@/lib/goals'
import { format, parseISO } from 'date-fns'

export const dynamic = 'force-dynamic'

/** Fast path: only what's needed for the above-the-fold content. */
async function getFastData(athleteId: number) {
  const profileQuery = supabaseAdmin
    .from('user_profiles')
    .select('display_name, max_hr, primary_group_id, timezone')
    .eq('athlete_id', athleteId)
    .maybeSingle()
  const [
    { data: activities },
    { data: tokenData },
    { data: userProfile },
    { data: goals },
    totalsByAthlete,
  ] = await Promise.all([
    supabaseAdmin
      .from('activities')
      .select('id,start_date,start_date_local,timezone,distance,moving_time,suffer_score,run_type,run_type_manual,type,name,average_heartrate,average_speed,average_cadence,total_elevation_gain')
      .eq('athlete_id', athleteId)
      .eq('type', 'Run')
      .order('start_date', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_data')
      .eq('athlete_id', athleteId)
      .single(),
    profileQuery,
    // Small table; fetched here so the next-race block paints with the page.
    supabaseAdmin
      .from('user_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('race_date'),
    profileQuery.then(({ data }) =>
      canonicalTotals([athleteId], getCoachRangeDefinitions(new Date(), profileTimezone(data)))),
  ])

  return {
    totals: totalsByAthlete[athleteId],
    activities: activities ?? [],
    athlete: tokenData?.athlete_data,
    displayName: userProfile?.display_name ?? null,
    maxHr: (userProfile?.max_hr as number | null) ?? null,
    timezone: profileTimezone(userProfile),
    primaryGroupId: userProfile?.primary_group_id ?? null,
    goals: (goals ?? []) as UserGoal[],
  }
}

function profileTimezone(profile: { timezone?: string | null } | null) {
  return validTimezone(profile?.timezone) ? profile!.timezone! : DEFAULT_TIMEZONE
}

/** Skeleton for the race estimates + goals section */
function RaceSectionSkeleton() {
  return (
    <div className="animate-pulse my-3 space-y-3">
      <div className="panel grid-cols-1 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="cell h-40" />
        ))}
      </div>
      <div className="panel grid-cols-2 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="cell h-24" />
        ))}
      </div>
    </div>
  )
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="readout" style={{ '--rail': color } as React.CSSProperties}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>{label}</p>
      <p className="stat-num text-xl sm:text-2xl font-bold mt-1" style={{ color: label === 'Form' ? color : undefined }}>{value}</p>
    </div>
  )
}

export default async function DashboardPage() {
  const cookieStore = cookies()
  const athleteId = await getAthleteId()
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  if (!athleteId) {
    return <OnboardingPage />
  }

  const { activities, athlete, displayName, primaryGroupId, totals, goals, maxHr, timezone } = await getFastData(Number(athleteId))
  // Weeks and days are the runner's own: each run counts on the day it was run,
  // and "today" is in the zone of their latest run.
  const today = localDate(new Date(), timezone)
  // The chart shows 90 days; don't serialize the full history to the client.
  const trainingLoad = calculateTrainingLoad(activities, { maxHr, timezone, today }).slice(-100)
  const load = trainingLoad[trainingLoad.length - 1]
  const runs = activities.map((a: any) => ({ ...a, day: runDay(a, timezone) }))
  const mileageRuns = runs.map(a => ({ day: a.day, distance: a.distance }))

  const thisWeek = weekStart(today)
  const weekTime = runs.filter(a => a.day >= thisWeek).reduce((s: number, a: any) => s + a.moving_time, 0)
  const weekDist = totals.week.meters
  const yearDist = totals.ytd.meters
  const unitLabel = distanceUnitLabel(unit)

  // Average of the four completed weeks before this one.
  const priorMeters = runs
    .filter(a => a.day >= addDays(thisWeek, -28) && a.day < thisWeek)
    .reduce((s: number, a: any) => s + a.distance, 0)
  const fourWeekAvg = formatDistanceShort(priorMeters / 4, unit).split(' ')[0]

  const nextRace = primaryRace(goals, today)
  const formColor = !load ? 'var(--text-3)' : load.tsb >= 0 ? 'var(--success)' : 'var(--warning)'

  const stats = [
    { label: 'Week runs',  value: `${totals.week.source_count}`, unit: 'runs' },
    { label: 'Week time',  value: weekTime > 0 ? formatDuration(weekTime) : '--', unit: '' },
    { label: 'This year',  value: formatDistanceShort(yearDist, unit).split(' ')[0], unit: unitLabel },
    { label: 'Activities', value: `${totals.ytd.source_count}`, unit: 'this yr' },
  ]

  return (
    <>
      <Nav />
      <BackgroundWork />
      {primaryGroupId && <PrefetchGroup groupId={primaryGroupId} />}
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">

        {/* Page header */}
        <div className="mb-5 sm:mb-7 fade-up">
          <h1 className="font-display font-extrabold uppercase leading-[0.95]" style={{ fontSize: 'clamp(30px, 6vw, 44px)', letterSpacing: '-0.02em' }}>
            Hey, {(displayName ?? athlete?.firstname ?? 'Runner').split(' ')[0]}
          </h1>
          <p className="font-mono text-[11px] mt-3 uppercase tracking-[0.16em] flex gap-3" style={{ color: 'var(--text-3)' }}>
            <span>{format(parseISO(today), 'EEE, MMM d')}</span>
            <span style={{ color: 'var(--text-4)' }}>/</span>
            <span>Wk {format(parseISO(today), 'I')}</span>
            <span className="hidden sm:inline" style={{ color: 'var(--text-4)' }}>/</span>
            <span className="hidden sm:inline">{totals.all_time.source_count} runs tracked</span>
          </p>
        </div>

        {/* ── Row 1: next race + weekly distance, stats band ── */}
        <div className="panel grid-cols-12 mb-3 fade-up">
          <NextRaceBlock
            athleteId={Number(athleteId)}
            goal={nextRace}
            unit={unit}
            className="col-span-12 md:col-span-5"
          />

          <div className="cell col-span-12 md:col-span-7">
            <Eyebrow n="01" label="Weekly distance" right={`4-wk avg ${fourWeekAvg}`} />
            <div className="stat-num font-bold leading-none mb-4" style={{ fontSize: 'clamp(34px, 5vw, 46px)', letterSpacing: '-0.02em' }}>
              {formatDistanceShort(weekDist, unit).split(' ')[0]}
              <span className="font-normal ml-1.5 uppercase" style={{ fontSize: 14, color: 'var(--text-3)' }}>{unitLabel}</span>
            </div>
            <div style={{ height: 150 }}>
              <WeeklyMileageChart activities={mileageRuns} today={today} weeks={12} />
            </div>
          </div>

          {stats.map((s, i) => (
            <div key={s.label} className="cell col-span-6 md:col-span-3">
              <Eyebrow n={`0${i + 2}`} label={s.label} />
              <div className="stat-num text-xl sm:text-[26px] font-bold leading-none">
                {s.value}
                {s.unit && <span className="font-normal ml-1" style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Training Load */}
        {trainingLoad.length > 0 && load && (
          <div className="panel grid-cols-12 mb-3 fade-up">
            <div className="cell col-span-12 md:col-span-3">
              <Eyebrow n="06" label="Training load" />
              <div className="flex md:flex-col gap-4 md:gap-5">
                <Readout label="Fitness" value={load.ctl.toFixed(0)} color="var(--accent)" />
                <Readout label="Fatigue" value={load.atl.toFixed(0)} color="#52525b" />
                <Readout label="Form" value={`${load.tsb > 0 ? '+' : load.tsb < 0 ? '−' : ''}${Math.abs(load.tsb).toFixed(0)}`} color={formColor} />
              </div>
            </div>
            <div className="cell col-span-12 md:col-span-9">
              <Eyebrow label="90 days" className="hidden md:flex" />
              <div style={{ height: 150 }}>
                <TrainingLoadChart data={trainingLoad} days={90} />
              </div>
            </div>
          </div>
        )}

        {/* ── Race Goals + Estimates (deferred) ── */}
        <Suspense fallback={<RaceSectionSkeleton />}>
          <DashboardRaceSection athleteId={Number(athleteId)} goals={goals} unit={unit} today={today} />
        </Suspense>

        {/* ── Recent Runs ── */}
        <RecentRunsCard runs={activities.slice(0, 7) as any} unit={unit} />

      </main>
    </>
  )
}
