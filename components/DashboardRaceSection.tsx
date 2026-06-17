/**
 * Async server component — deferred via Suspense.
 * Fetches race estimates (with snapshot cache) + user goals.
 * Streams into the dashboard independently of the group section.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { saveSnapshot, fetchSnapshotsByDate, fetchTodaysExtras, buildAllDeltas, todayDate, type TodaysExtras } from '@/lib/estimateSnapshots'
import GoalsSection from '@/components/GoalsSection'
import { formatDuration, type DistanceUnit } from '@/lib/utils'
import Link from 'next/link'
import { type UserGoal } from '@/lib/goals'
import {
  confidenceByDistance,
  getAthleteAnalysis,
  sourceCountsByDistance,
} from '@/lib/analysis/service'
import { isCPEngineEnabled } from '@/lib/analysis/projector-service'

async function getRaceData(athleteId: number) {
  // Single snapshot query serves dual purpose:
  // 1. Today's cache check (skip re-running analysis if already computed today)
  // 2. Historical byDate map for delta arrows
  const [goalsData, byDate, extrasFromSnapshot] = await Promise.all([
    supabaseAdmin
      .from('user_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('race_date', { ascending: true })
      .then(r => (r.data ?? []) as UserGoal[]),
    fetchSnapshotsByDate(athleteId),
    fetchTodaysExtras(athleteId),
  ])

  const today = todayDate()
  const todaySnaps = byDate[today] ?? {}
  const cachedKeys = Object.keys(todaySnaps)

  let estimates: Record<string, number | null>
  let confidence: Record<string, number> = {}
  let sourceCounts: Record<string, Record<string, number>> = {}
  let extras: Record<string, TodaysExtras> = extrasFromSnapshot
  const shouldRefreshEstimates = isCPEngineEnabled()

  if (!shouldRefreshEstimates && cachedKeys.length >= 2) {
    // Use today's cached estimates — skip the heavy analysis engine
    estimates = {
      '5k':  todaySnaps['5k']  ?? null,
      '10k': todaySnaps['10k'] ?? null,
      'hm':  todaySnaps['hm']  ?? null,
      'fm':  todaySnaps['fm']  ?? null,
    }
  } else {
    // Cache miss — run full analysis and save snapshot
    const analysis = await getAthleteAnalysis(athleteId, {
      activityColumns: '*',
      intervalLimit: 20,
      thresholdLimit: 20,
      longLimit: 15,
      easyLimit: 30,
      raceLimit: 10,
      allActivitiesLimit: 200,
    })

    estimates = analysis.currentEstimates
    confidence = confidenceByDistance(analysis.result)
    sourceCounts = sourceCountsByDistance(analysis.result)

    await saveSnapshot(athleteId, estimates, analysis.snapshotExtras ?? undefined)
    // Merge today's new estimates into byDate so delta computation is up-to-date
    byDate[today] = Object.fromEntries(
      Object.entries(estimates).filter(([, v]) => v != null) as [string, number][]
    )
    // Surface the freshly computed extras to the render path immediately —
    // the snapshot row we just wrote isn't reflected in `extrasFromSnapshot`.
    if (analysis.snapshotExtras) {
      extras = {}
      for (const [dk, e] of Object.entries(analysis.snapshotExtras)) {
        extras[dk] = {
          idealSecs:    e.idealSecs    ?? null,
          todaySecs:    e.todaySecs    ?? null,
          p80LowSecs:   e.p80LowSecs   ?? null,
          p80HighSecs:  e.p80HighSecs  ?? null,
        }
      }
    }
  }

  const deltas = buildAllDeltas(estimates, byDate)

  return { estimates, confidence, sourceCounts, goals: goalsData, deltas, extras }
}

export default async function DashboardRaceSection({
  athleteId,
  unit,
  hasMaxHr,
}: {
  athleteId: number
  unit: DistanceUnit
  hasMaxHr: boolean
}) {
  const { estimates, confidence, sourceCounts, goals, deltas, extras } = await getRaceData(athleteId)

  const hasEstimates = Object.values(estimates).some(v => v != null)
  if (!hasEstimates && goals.length === 0) return null

  return (
    <>
      {/* Goals */}
      <div className="mt-6 mb-3">
        <GoalsSection
          initialGoals={goals}
          estimates={Object.fromEntries(Object.entries(estimates).filter(([, v]) => v != null)) as Record<string, number>}
          confidence={confidence}
          sourceCounts={sourceCounts}
          unit={unit}
        />
      </div>

      {/* Race Estimates */}
      {hasEstimates && (
        <section className="mt-6 mb-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">Race Estimates</h2>
            <Link href="/analysis" prefetch={true} className="font-mono text-xs text-[#f97316] hover:text-orange-400 transition-colors">
              Full analysis →
            </Link>
          </div>
        <div className="card fade-up" style={{ padding: '1.25rem' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['5k', '10k', 'hm', 'fm'] as const).map(key => {
              const label = key === '5k' ? '5K' : key === '10k' ? '10K' : key === 'hm' ? 'Half' : 'Full'
              const delta = deltas[key]?.month ?? null
              const improved = delta != null && delta < 0
              const regressed = delta != null && delta > 0
              const idealSecs = extras[key]?.idealSecs ?? null
              const todaySecs = extras[key]?.todaySecs ?? null
              // Only show the current line when (a) we have both numbers and
              // (b) they differ by more than 5s — same number with rounding noise
              // would just be visual clutter.
              const showCurrent = idealSecs != null && todaySecs != null && Math.abs(todaySecs - idealSecs) > 5
              return (
                <div key={key} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.875rem' }}>
                  <p className="font-mono text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="stat-num text-xl font-bold leading-none" style={{ color: estimates[key] ? '#f0f0f0' : 'var(--text-muted)' }}>
                    {estimates[key] ? formatDuration(estimates[key]!) : '—'}
                  </p>
                  {showCurrent && (
                    <p className="font-mono text-[10px] mt-1.5 leading-none" style={{ color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--text-3, #6b7280)' }}>current</span>{' '}
                      <span style={{ color: '#a1a1aa' }}>{formatDuration(todaySecs)}</span>
                    </p>
                  )}
                  {delta != null && (
                    <p className="font-mono text-[10px] mt-1.5 leading-none" style={{ color: improved ? '#10b981' : regressed ? '#ef4444' : '#6b7280' }}>
                      {improved ? `▼ ${formatDuration(Math.abs(delta))}` : regressed ? `▲ ${formatDuration(Math.abs(delta))}` : '—'}{' '}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs 1mo</span>
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        </section>
      )}

      {/* Max HR warning */}
      {!hasMaxHr && hasEstimates && (
        <div className="flex items-center gap-2 rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.20)' }}>
          <span style={{ color: 'var(--orange)', flexShrink: 0 }}>⚠</span>
          <span style={{ color: 'var(--text-2)' }}>
            Race projections use a default max HR of 195 bpm — open{' '}
            <span className="text-white font-medium">Settings</span>{' '}
            (gear icon) to add your actual max HR for more accurate estimates.
          </span>
        </div>
      )}
    </>
  )
}
