/**
 * Async server component — deferred via Suspense.
 * Fetches race estimates (with snapshot cache) + user goals.
 * Streams into the dashboard independently of the group section.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { saveSnapshot, fetchSnapshotsByDate, buildAllDeltas, todayDate } from '@/lib/estimateSnapshots'
import GoalsSection from '@/components/GoalsSection'
import { formatDuration, type DistanceUnit } from '@/lib/utils'
import Link from 'next/link'
import { type UserGoal } from '@/lib/goals'
import {
  confidenceByDistance,
  getAthleteAnalysis,
  sourceCountsByDistance,
} from '@/lib/analysis/service'

async function getRaceData(athleteId: number) {
  // Single snapshot query serves dual purpose:
  // 1. Today's cache check (skip re-running analysis if already computed today)
  // 2. Historical byDate map for delta arrows
  const [goalsData, byDate] = await Promise.all([
    supabaseAdmin
      .from('user_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('race_date', { ascending: true })
      .then(r => (r.data ?? []) as UserGoal[]),
    fetchSnapshotsByDate(athleteId),
  ])

  const today = todayDate()
  const todaySnaps = byDate[today] ?? {}
  const cachedKeys = Object.keys(todaySnaps)

  let estimates: Record<string, number | null>
  let confidence: Record<string, number> = {}
  let sourceCounts: Record<string, Record<string, number>> = {}

  if (cachedKeys.length >= 2) {
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

    await saveSnapshot(athleteId, estimates)
    // Merge today's new estimates into byDate so delta computation is up-to-date
    byDate[today] = Object.fromEntries(
      Object.entries(estimates).filter(([, v]) => v != null) as [string, number][]
    )
  }

  const deltas = buildAllDeltas(estimates, byDate)

  return { estimates, confidence, sourceCounts, goals: goalsData, deltas }
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
  const { estimates, confidence, sourceCounts, goals, deltas } = await getRaceData(athleteId)

  const hasEstimates = Object.values(estimates).some(v => v != null)
  if (!hasEstimates && goals.length === 0) return null

  return (
    <>
      {/* Goals */}
      <div className="mt-8 mb-[14px]">
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
        <section className="mt-8 mb-[14px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-[28px] text-[#F4F4F4] uppercase leading-none">Race Estimates</h2>
            <Link href="/analysis" prefetch={true} className="pulse-link">
              Full analysis
            </Link>
          </div>
        <div className="card top-stripe-magenta fade-up" style={{ padding: '24px' }}>
          <span className="card-index">[08]</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-[10px]">
            {(['5k', '10k', 'hm', 'fm'] as const).map(key => {
              const label = key === '5k' ? '5K' : key === '10k' ? '10K' : key === 'hm' ? 'Half' : 'Full'
              const delta = deltas[key]?.month ?? null
              const improved = delta != null && delta < 0
              const regressed = delta != null && delta > 0
              return (
                <div key={key} style={{ background: 'var(--ink-2)', border: '1px solid var(--hair-1)', borderRadius: 0, padding: '14px' }}>
                  <p className="metric-label mb-2">/ {label}</p>
                  <p className="stat-num text-[32px] font-bold leading-none" style={{ color: estimates[key] ? '#F4F4F4' : 'var(--fg-3)' }}>
                    {estimates[key] ? formatDuration(estimates[key]!) : '—'}
                  </p>
                  {delta != null && (
                    <p className="font-mono text-[10px] mt-2 leading-none uppercase tracking-[0.12em]" style={{ color: improved ? 'var(--acid)' : regressed ? 'var(--magenta)' : 'var(--fg-3)' }}>
                      {improved ? `DOWN ${formatDuration(Math.abs(delta))}` : regressed ? `UP ${formatDuration(Math.abs(delta))}` : '--'}{' '}
                      <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>vs 1mo</span>
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
        <div className="flex items-center gap-3 px-4 py-3 mb-4 text-sm" style={{ background: 'var(--ink-1)', border: '1px solid var(--orange)' }}>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--orange)', flexShrink: 0 }}>/ Warn</span>
          <span style={{ color: 'var(--text-2)' }}>
            Race projections use a default max HR of 195 bpm / open{' '}
            <span className="text-white font-medium">Settings</span>{' '}
            (gear icon) to add your actual max HR for more accurate estimates.
          </span>
        </div>
      )}
    </>
  )
}
