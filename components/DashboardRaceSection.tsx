/**
 * Async server component — deferred via Suspense.
 * Fetches race estimates (with snapshot cache) + user goals.
 * Streams into the dashboard independently of the group section.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { analyzeAllAndCombine } from '@/lib/analysis'
import { saveSnapshot, fetchSnapshotsByDate, buildAllDeltas, todayDate } from '@/lib/estimateSnapshots'
import GoalsSection from '@/components/GoalsSection'
import { formatDuration, type DistanceUnit } from '@/lib/utils'
import Link from 'next/link'
import { type UserGoal } from '@/lib/goals'

async function getRaceData(athleteId: number) {
  const EASY_RUN_TYPES = ['easy', 'easy_strides', 'long_easy', 'recovery']

  // Single snapshot query serves dual purpose:
  // 1. Today's cache check (skip re-running analysis if already computed today)
  // 2. Historical byDate map for delta arrows
  const [goalsData, userProfile, byDate] = await Promise.all([
    supabaseAdmin
      .from('user_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('race_date', { ascending: true })
      .then(r => (r.data ?? []) as UserGoal[]),
    supabaseAdmin
      .from('user_profiles')
      .select('max_hr')
      .eq('athlete_id', athleteId)
      .maybeSingle()
      .then(r => r.data),
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
    const maxHr = userProfile?.max_hr ?? 195

    const [
      { data: intervalRuns },
      { data: thresholdRuns },
      { data: longRuns },
      { data: easyRuns },
      allActivities,
    ] = await Promise.all([
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['intervals', 'interval_5k', 'interval_10k']).order('start_date', { ascending: false }).limit(20),
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['threshold', 'tempo']).order('start_date', { ascending: false }).limit(20),
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['long', 'long_easy', 'long_progressive', 'long_steady']).order('start_date', { ascending: false }).limit(15),
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', EASY_RUN_TYPES).order('start_date', { ascending: false }).limit(30),
      supabaseAdmin.from('activities').select('start_date,run_type,distance').eq('athlete_id', athleteId).eq('type', 'Run').order('start_date', { ascending: false }).limit(200).then(r => r.data ?? []),
    ])

    let raceRuns: any[] = []
    try {
      const { data } = await supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('is_race', true).order('start_date', { ascending: false }).limit(10)
      raceRuns = data ?? []
    } catch {}

    let analysisResult: ReturnType<typeof analyzeAllAndCombine>
    try {
      analysisResult = analyzeAllAndCombine(
        intervalRuns ?? [],
        thresholdRuns ?? [],
        longRuns ?? [],
        easyRuns ?? [],
        raceRuns,
        maxHr,
        allActivities,
      )
    } catch {
      analysisResult = {
        intervalEstimates: [], thresholdEstimates: [], longRunAnalyses: [],
        raceAnalyses: [], easyRunResults: [], easyTrendEstimates: [], allRaceEstimates: [],
        combined: { '5k': null, '10k': null, 'hm': null, 'fm': null },
      } as any
    }

    estimates = {
      '5k':  analysisResult.combined['5k']?.bestEstimateSecs  ?? null,
      '10k': analysisResult.combined['10k']?.bestEstimateSecs ?? null,
      'hm':  analysisResult.combined['hm']?.bestEstimateSecs  ?? null,
      'fm':  analysisResult.combined['fm']?.bestEstimateSecs  ?? null,
    }

    for (const dk of ['5k', '10k', 'hm', 'fm'] as const) {
      const c = analysisResult.combined[dk]
      if (c) {
        confidence[dk] = c.confidence
        const counts: Record<string, number> = {}
        for (const contrib of c.contributors) {
          counts[contrib.source] = (counts[contrib.source] ?? 0) + 1
        }
        sourceCounts[dk] = counts
      }
    }

    saveSnapshot(athleteId, estimates)
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
        <section className="mt-8 mb-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">Race Estimates</h2>
            <Link href="/analysis" className="font-mono text-xs text-[#f97316] hover:text-orange-400 transition-colors">
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
              return (
                <div key={key} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.875rem' }}>
                  <p className="font-mono text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="stat-num text-xl font-bold leading-none" style={{ color: estimates[key] ? '#f0f0f0' : 'var(--text-muted)' }}>
                    {estimates[key] ? formatDuration(estimates[key]!) : '—'}
                  </p>
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
