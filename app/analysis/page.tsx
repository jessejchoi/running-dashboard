import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import FiveKTrendChart from '@/components/FiveKTrendChart'
import AerobicEfficiencyChart from '@/components/AerobicEfficiencyChart'
import {
  formatTime, formatPace,
  type FiveKEstimate,
} from '@/lib/analysis'
import { speedToPace, formatDuration, toJakartaDate, paceUnitLabel, formatDistanceShort, type DistanceUnit } from '@/lib/utils'
import { distanceLabel } from '@/lib/goals'
import { format, parseISO } from 'date-fns'
import ToggleAnalysisButton from '@/components/ToggleAnalysisButton'
import CollapsibleRuns from '@/components/CollapsibleRuns'
import AnalysisDistanceSection from '@/components/AnalysisDistanceSection'
import { AnalysisTabProvider } from '@/components/AnalysisTabContext'
import SourceEstimateBadge from '@/components/SourceEstimateBadge'
import RunEstimateBadge from '@/components/RunEstimateBadge'
import RepTableClient from '@/components/RepTableClient'
import { fetchDeltas, saveSnapshot, type AllDeltas } from '@/lib/estimateSnapshots'
import { getAthleteAnalysis } from '@/lib/analysis/service'

export const revalidate = 60

// ── Pulse accent colors per source ─────────────────────────────────────
const C_INTERVAL = '#ff1d6c'   // magenta — peak / intervals
const C_THRESHOLD = '#d9ff36'  // acid — work zone / threshold
const C_AEROBIC = '#5ad7ff'    // ice — informational / steady
const C_RACE = '#ff1d6c'       // magenta — race day stands apart

export default async function AnalysisPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  const {
    inputs: { intervalRuns, thresholdRuns, longRuns, easyRuns, hasMaxHr },
    result,
    combinedJson,
    currentEstimates,
    targetSecsMap,
  } = await getAthleteAnalysis(Number(athleteId), {
    easyLookbackMonths: 3,
    longLimit: 15,
    raceLimit: 10,
    allActivitiesLimit: 200,
  })

  const { intervalEstimates, thresholdEstimates, longRunAnalyses, raceAnalyses, easyRunResults, longRunEfficiencyPoints } = result
  const easyOnly = easyRunResults.filter(r => !r.excludedReason && !(r as any).runKind)
  const allAerobicEstimates = [...easyOnly, ...(longRunEfficiencyPoints ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
  const easyRunResultsWithRuns = (easyRuns ?? []).map((r: any) => ({
    run: r,
    result: easyRunResults.find(e => e.activityId === r.id) ?? null,
  }))

  await saveSnapshot(Number(athleteId), currentEstimates)
  const allDeltas: AllDeltas = await fetchDeltas(Number(athleteId), currentEstimates)

  const TARGET_5K = targetSecsMap['5k'] ?? (22 * 60 + 30)

  // ── Inline sub-components (kept inside the page like the original) ───

  function WorkRestStats({ est, isThreshold }: {
    est: { totalWorkSecs: number; totalRestSecs: number; workRestRatio: number; correctionFactor: number; effortsUsed: number; isContinuous?: boolean }
    isThreshold?: boolean
  }) {
    return (
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <div className="px-3 py-2" style={{ background: 'var(--ink-2)' }}>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] mb-0.5" style={{ color: 'var(--fg-3)' }}>WORK : REST</div>
          <div className="font-mono font-bold" style={{ color: 'var(--fg-1)' }}>
            {formatDuration(est.totalWorkSecs)} : {est.totalRestSecs > 0 ? formatDuration(est.totalRestSecs) : '—'}
          </div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--fg-4)' }}>
            {est.isContinuous ? 'continuous run' : est.totalRestSecs > 0
              ? `${formatDuration(Math.round(est.totalRestSecs / est.effortsUsed))} rest/rep`
              : 'no rest detected'}
          </div>
        </div>
        {isThreshold && est.isContinuous ? (
          <div className="px-3 py-2" style={{ background: 'var(--ink-2)' }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] mb-0.5" style={{ color: 'var(--fg-3)' }}>INTENSITY</div>
            <div className="font-mono font-bold" style={{ color: C_THRESHOLD }}>{(est.correctionFactor * 100).toFixed(1)}%</div>
            <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--fg-4)' }}>tempo → 5K</div>
          </div>
        ) : (
          <div className="px-3 py-2" style={{ background: 'var(--ink-2)' }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] mb-0.5" style={{ color: 'var(--fg-3)' }}>REST CORR.</div>
            <div className="font-mono font-bold" style={{ color: C_INTERVAL }}>+{((est.correctionFactor - 1) * 100).toFixed(1)}%</div>
            <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--fg-4)' }}>added to estimate</div>
          </div>
        )}
        <div className="px-3 py-2" style={{ background: 'var(--ink-2)' }}>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] mb-0.5" style={{ color: 'var(--fg-3)' }}>EFFORTS</div>
          <div className="font-mono font-bold" style={{ color: 'var(--fg-1)' }}>{est.effortsUsed}</div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--fg-4)' }}>{est.isContinuous ? 'continuous' : 'reps'}</div>
        </div>
      </div>
    )
  }

  function ContinuousRunTable({ run }: { run: any }) {
    const laps: any[] = run.laps ?? []
    const splits: any[] = run.splits ?? []
    const displayLaps = laps.length > 0 ? laps : splits
    const avgPace = run.average_speed ? 1000 / run.average_speed : 999
    if (displayLaps.length === 0) return (
      <div className="text-xs px-3 py-2 font-mono" style={{ background: 'var(--ink-2)', color: 'var(--fg-4)' }}>No lap data.</div>
    )
    return (
      <div className="overflow-x-auto" style={{ background: 'var(--ink-2)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hair-1)' }}>
              {[laps.length > 0 ? 'LAP' : (unit === 'miles' ? 'MI' : 'KM'), 'DIST', 'PACE', 'TIME', 'HR'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--fg-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayLaps.map((lap: any, i: number) => {
              if (!lap.average_speed) return null
              const lapPace = 1000 / lap.average_speed
              const isWarmCool = lapPace > avgPace + 20
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--hair-1)' }}>
                  <td className={`px-3 py-2 font-mono`} style={{ color: isWarmCool ? 'var(--fg-4)' : 'var(--fg-3)' }}>{i+1}</td>
                  <td className={`px-3 py-2 font-mono`} style={{ color: isWarmCool ? 'var(--fg-4)' : 'var(--fg-1)' }}>
                    {lap.distance >= 1000 ? formatDistanceShort(lap.distance, unit) : `${Math.round(lap.distance)}m`}
                  </td>
                  <td className={`px-3 py-2 font-mono font-bold`} style={{ color: isWarmCool ? 'var(--fg-4)' : 'var(--fg-1)' }}>{speedToPace(lap.average_speed, unit)}{paceUnitLabel(unit)}</td>
                  <td className={`px-3 py-2 font-mono`} style={{ color: isWarmCool ? 'var(--fg-4)' : 'var(--fg-2)' }}>{formatDuration(lap.moving_time)}</td>
                  <td className={`px-3 py-2 font-mono`} style={{ color: isWarmCool ? 'var(--fg-4)' : 'var(--fg-2)' }}>{lap.average_heartrate ? `${Math.round(lap.average_heartrate)}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--fg-4)' }}>greyed laps = warmup/cooldown</div>
      </div>
    )
  }

  return (
    <>
      <Nav />
      <AnalysisTabProvider>
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <div className="mb-8 fade-up pb-6" style={{ borderBottom: '2px solid var(--fg-1)' }}>
          <h1 className="font-display font-bold uppercase" style={{ fontSize: 'clamp(40px, 7vw, 72px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}>
            RACE ANALYSIS<span style={{ color: 'var(--magenta)' }}>.</span>
          </h1>
          <p className="mt-3 max-w-3xl text-sm" style={{ color: 'var(--fg-2)' }}>
            Multi-distance estimates from intervals, tempo, long runs, easy trends, and race results — combined with confidence and recency weighting.
          </p>
          {!hasMaxHr && (
            <div className="flex items-center gap-3 px-4 py-3 mt-4 text-sm max-w-xl" style={{ background: 'var(--ink-2)', borderLeft: '3px solid var(--pulse-orange)' }}>
              <span className="shrink-0 font-mono font-bold uppercase tracking-[0.18em] text-[10px]" style={{ color: 'var(--pulse-orange)' }}>! WARN</span>
              <span style={{ color: 'var(--fg-2)' }}>HR-based corrections use a default max HR of 195 bpm — open <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>Settings</span> (gear icon) to add your actual max HR.</span>
            </div>
          )}
        </div>

        {/* Distance Tabs + Combined Estimate + Source Cards */}
        <AnalysisDistanceSection
          combined={combinedJson}
          targetSecsMap={targetSecsMap}
          allDeltas={allDeltas}
        />

        {/* ── SESSION DETAILS GRID ────────────────────────────────────── */}
        <div className="mt-12">
          <h2 className="font-display font-bold uppercase text-2xl mb-6" style={{ letterSpacing: '-0.02em' }}>SESSION DETAILS</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">

            {/* ── COL 1: Intervals (magenta) ─────────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="card pulse-bar fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="pulse-label" style={{ color: C_INTERVAL }}>INTERVALS</h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-4)' }}>{intervalEstimates.length} SESSION{intervalEstimates.length !== 1 ? 'S' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="interval" color={C_INTERVAL} label="intervals" />
                </div>
                <FiveKTrendChart estimates={intervalEstimates} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} color={C_INTERVAL} />
              </div>
              {intervalEstimates.length === 0 && (
                <div className="card text-center py-10 font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--fg-3)' }}>
                  Tag runs as &quot;Interval 5K&quot; to see estimates.
                </div>
              )}
              <CollapsibleRuns count={(intervalRuns ?? []).length} color={C_INTERVAL}>
                {(intervalRuns ?? []).map((run: any) => {
                  const estimate = intervalEstimates.find(e => e.activityId === run.id)
                  return (
                    <div key={run.id} className={`card pulse-bar fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-display font-bold uppercase text-base" style={{ letterSpacing: '-0.005em' }}>{run.name}</span>
                            <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                          </div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-3)' }}>
                            {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}
                          </div>
                        </div>
                        {estimate ? (
                          <RunEstimateBadge raceEstimates={estimate.raceEstimates} fallbackSecs={estimate.estimatedSecs} color={C_INTERVAL} />
                        ) : <div className="font-mono text-[10px] uppercase tracking-[0.14em] pt-1" style={{ color: 'var(--fg-4)' }}>NO HARD EFFORTS</div>}
                      </div>
                      {estimate && <WorkRestStats est={estimate} />}
                      {estimate && <RepTableClient efforts={estimate.allEfforts} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} unit={unit} />}
                      {estimate?.repDrift?.reliable && (
                        <div className="mt-2 flex items-center gap-2 text-xs font-mono">
                          <span style={{ color: 'var(--fg-3)' }}>REP DRIFT</span>
                          <span className="font-bold" style={{ color: estimate.repDrift.excessDrift > 1 ? C_INTERVAL : estimate.repDrift.excessDrift < -0.5 ? C_THRESHOLD : 'var(--fg-3)' }}>
                            {estimate.repDrift.drift.toFixed(1)}%
                          </span>
                          <span className="text-[10px]" style={{ color: estimate.repDrift.excessDrift > 1 ? C_INTERVAL : estimate.repDrift.excessDrift < -0.5 ? C_THRESHOLD : 'var(--fg-4)' }}>
                            ({estimate.repDrift.excessDrift > 0 ? '+' : ''}{estimate.repDrift.excessDrift.toFixed(1)}% vs expected
                            {estimate.repDrift.paceAdjusted ? ', pace-adj.' : ''})
                          </span>
                          <span className="ml-auto" style={{ color: 'var(--fg-4)' }}>rep 1: {Math.round(estimate.repDrift.firstRepHR)} → last: {Math.round(estimate.repDrift.lastRepHR)} bpm</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CollapsibleRuns>
            </div>

            {/* ── COL 2: Tempo / Threshold (acid) ─────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="card pulse-bar acid fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="pulse-label" style={{ color: C_THRESHOLD }}>THRESHOLD</h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-4)' }}>{thresholdEstimates.length} SESSION{thresholdEstimates.length !== 1 ? 'S' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="threshold" color={C_THRESHOLD} label="tempo" />
                </div>
                <FiveKTrendChart estimates={thresholdEstimates} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} color={C_THRESHOLD} />
              </div>
              {thresholdEstimates.length === 0 && (
                <div className="card text-center py-10 font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--fg-3)' }}>
                  Tag runs as &quot;Threshold&quot; or &quot;Tempo&quot; to see estimates.
                </div>
              )}
              {(() => {
                const fastBlockCards = thresholdEstimates.filter(e => (e as any).isLongRunFastBlock)
                type TempoItem =
                  | { kind: 'run'; run: any; date: string }
                  | { kind: 'fb';  est: FiveKEstimate; date: string }
                const items: TempoItem[] = [
                  ...(thresholdRuns ?? []).map((run: any) => ({ kind: 'run' as const, run, date: run.start_date as string })),
                  ...fastBlockCards.map(est => ({ kind: 'fb' as const, est, date: est.date + 'T12:00:00' })),
                ].sort((a, b) => b.date.localeCompare(a.date))

                return (
                  <CollapsibleRuns count={items.length} color={C_THRESHOLD}>
                    {items.map(item => {
                      if (item.kind === 'run') {
                        const run = item.run
                        const estimate = thresholdEstimates.find(e => e.activityId === run.id && !(e as any).isLongRunFastBlock)
                        return (
                          <div key={run.id} className={`card pulse-bar acid fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                            <div className="flex items-start justify-between gap-4 mb-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-display font-bold uppercase text-base" style={{ letterSpacing: '-0.005em' }}>{run.name}</span>
                                  <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                                </div>
                                <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-3)' }}>
                                  {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}
                                </div>
                              </div>
                              {estimate ? (
                                <RunEstimateBadge raceEstimates={estimate.raceEstimates} fallbackSecs={estimate.estimatedSecs} color={C_THRESHOLD} />
                              ) : <div className="font-mono text-[10px] uppercase tracking-[0.14em] pt-1" style={{ color: 'var(--fg-4)' }}>NO ESTIMATE</div>}
                            </div>
                            {estimate && <WorkRestStats est={estimate} isThreshold />}
                            {estimate && !estimate.isContinuous && <RepTableClient efforts={estimate.allEfforts} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} unit={unit} />}
                            {estimate && estimate.isContinuous && <ContinuousRunTable run={run} />}
                          </div>
                        )
                      }
                      const est = item.est
                      const lr = longRunAnalyses.find(l => l.activityId === est.activityId)
                      const lrRun = (longRuns ?? []).find((r: any) => r.id === est.activityId)
                      const blocks = lr?.allFastBlocks?.length ? lr.allFastBlocks : (lr?.fastBlock ? [lr.fastBlock] : [])
                      return (
                        <div key={`fb-${est.activityId}`} className={`card pulse-bar acid fade-up ${lrRun?.excluded_from_analysis ? 'opacity-40' : ''}`}>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="font-display font-bold uppercase text-base" style={{ letterSpacing: '-0.005em' }}>{est.activityName.replace(' (fast block)', '')}</span>
                                <ToggleAnalysisButton activityId={est.activityId} excluded={!!lrRun?.excluded_from_analysis} />
                                <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5" style={{ color: 'var(--acid)', border: '1px solid var(--acid)' }}>LR FAST BLOCK</span>
                              </div>
                              <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-3)' }}>
                                {format(parseISO(est.date + 'T12:00:00'), 'EEE, MMM d yyyy')} · {formatDistanceShort(lrRun?.distance ?? 0, unit)}
                                {lr?.fatigueCredit != null && lr.fatigueCredit > 0 && (
                                  <span className="ml-2 font-bold" style={{ color: 'var(--acid)' }}>+{lr.fatigueCredit.toFixed(1)}s fatigue credit</span>
                                )}
                              </div>
                            </div>
                            <RunEstimateBadge raceEstimates={est.raceEstimates} fallbackSecs={est.estimatedSecs} color={C_THRESHOLD} />
                          </div>
                          {blocks.length > 0 && (
                            <div className="overflow-x-auto" style={{ background: 'var(--ink-2)' }}>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--hair-1)' }}>
                                    {['BLOCK', 'PACE', 'DURATION', 'HR', 'EST HM'].map(h => (
                                      <th key={h} className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--fg-3)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {blocks.map((block, i) => {
                                    const isPrimary = block.startSec === lr?.fastBlock?.startSec
                                    const hmEst = isPrimary ? lr?.fastBlockEstimates?.find(e => e.distanceKey === 'hm') : undefined
                                    return (
                                      <tr key={i} style={{ borderBottom: '1px solid var(--hair-1)' }}>
                                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--fg-3)' }}>
                                          min {Math.round(block.startSec/60)}–{Math.round(block.endSec/60)}
                                          {isPrimary && blocks.length > 1 && <span className="ml-1 text-[10px]" style={{ color: C_THRESHOLD }}>★</span>}
                                        </td>
                                        <td className="px-3 py-2 font-mono font-bold" style={{ color: C_THRESHOLD }}>{formatPace(block.avgPace)}/km</td>
                                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--fg-1)' }}>{formatDuration(block.durationSecs)}</td>
                                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--fg-2)' }}>{block.avgHR > 0 ? `${Math.round(block.avgHR)} bpm` : '—'}</td>
                                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--fg-1)' }}>{hmEst ? formatTime(hmEst.estimatedSecs) : '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                              {lr?.fatigueCredit != null && lr.fatigueCredit > 0 && (
                                <div className="px-3 py-2 font-mono text-[10px]" style={{ color: 'var(--fg-4)' }}>★ = primary block · Est HM uses +{lr.fatigueCredit.toFixed(1)}s/km fatigue credit</div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </CollapsibleRuns>
                )
              })()}
            </div>

            {/* ── COL 3: Aerobic Efficiency (ice) ─────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="card pulse-bar ice fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="pulse-label" style={{ color: C_AEROBIC }}>AEROBIC EFFICIENCY</h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-4)' }}>{allAerobicEstimates.length} RUN{allAerobicEstimates.length !== 1 ? 'S' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="easy_trend" color={C_AEROBIC} label="easy trend" />
                </div>
                <AerobicEfficiencyChart runs={allAerobicEstimates} />
              </div>
              {(() => {
                const longRunIds = new Set((longRunEfficiencyPoints ?? []).map(p => p.activityId))
                const longRunsForAerobic = (longRuns ?? []).filter((r: any) => longRunIds.has(r.id))
                const easyCards = easyRunResultsWithRuns.filter(({ result }) => result?.excludedReason !== 'Treadmill run — no GPS pace data')
                const totalAerobicCount = easyCards.length + longRunsForAerobic.length
                return (
                  <CollapsibleRuns count={totalAerobicCount} color={C_AEROBIC}>
                    {easyCards.map(({ run, result: eff }) => (
                      <div key={run.id} className={`card pulse-bar ice fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-display font-bold uppercase text-base" style={{ letterSpacing: '-0.005em' }}>{run.name}</span>
                              <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} autoExcludedReason={eff?.excludedReason} />
                            </div>
                            <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-3)' }}>
                              {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}
                              {run.run_type && <span className="ml-2 capitalize" style={{ color: C_AEROBIC }}>{run.run_type.replace(/_/g, ' ')}</span>}
                            </div>
                          </div>
                          {eff && !eff.excludedReason ? (
                            <div className="text-right shrink-0">
                              <div className="font-display font-bold text-xl stat-num" style={{ color: C_AEROBIC }}>{speedToPace(1000/eff.normalizedPaceSec, unit)}{paceUnitLabel(unit)}</div>
                              <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-3)' }}>@ 150 BPM</div>
                            </div>
                          ) : null}
                        </div>
                        {eff?.excludedReason && (
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] px-3 py-2" style={{ background: 'var(--ink-2)', color: 'var(--fg-3)' }}>{eff.excludedReason}</div>
                        )}
                      </div>
                    ))}
                    {longRunsForAerobic.map((run: any) => {
                      const a = longRunAnalyses.find(lr => lr.activityId === run.id)
                      const effPoint = (longRunEfficiencyPoints ?? []).find(p => p.activityId === run.id)
                      return (
                        <div key={run.id} className={`card pulse-bar ice fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-display font-bold uppercase text-base" style={{ letterSpacing: '-0.005em' }}>{run.name}</span>
                                <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                              </div>
                              <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-3)' }}>
                                {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}
                                {a && <span className="ml-2 capitalize" style={{ color: 'var(--acid)' }}>{a.runStructure === 'fast_middle' ? 'fast block' : a.runStructure}</span>}
                              </div>
                            </div>
                            {effPoint && (
                              <div className="text-right shrink-0">
                                <div className="font-display font-bold text-xl stat-num" style={{ color: C_AEROBIC }}>{speedToPace(1000/effPoint.normalizedPaceSec, unit)}{paceUnitLabel(unit)}</div>
                                <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--fg-3)' }}>STEADY @ 150 BPM</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </CollapsibleRuns>
                )
              })()}
            </div>

          </div>
        </div>

        {/* ── RACE RESULTS ────────────────────────────────────────────── */}
        {raceAnalyses.length > 0 && (
          <div className="mt-6 max-w-sm">
            <div className="card pulse-bar fade-up">
              <div className="flex items-center justify-between mb-1">
                <h2 className="pulse-label">RACE RESULTS</h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--fg-4)' }}>{raceAnalyses.length} RACES</span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1 mb-4" style={{ color: 'var(--fg-3)' }}>GOLD STANDARD · DIRECT PERFORMANCE</p>
              <div className="space-y-2">
                {raceAnalyses.map(race => (
                  <div key={race.activityId} className="px-3 py-2 text-xs" style={{ background: 'var(--ink-2)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold uppercase text-sm" style={{ color: C_RACE, letterSpacing: '-0.005em' }}>{race.activityName}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--fg-3)' }}>{race.date}</span>
                    </div>
                    <div className="flex gap-4 items-center">
                      <span className="font-mono font-bold" style={{ color: 'var(--fg-1)' }}>{distanceLabel(race.matchedDistanceKey)}</span>
                      <span className="font-mono font-bold" style={{ color: C_RACE }}>{formatTime(race.raceTimeSecs)}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--acid)' }}>0.98 CONF</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
      </AnalysisTabProvider>
    </>
  )
}
