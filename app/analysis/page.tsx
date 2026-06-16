import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import FiveKTrendChart from '@/components/FiveKTrendChart'
import AerobicEfficiencyChart from '@/components/AerobicEfficiencyChart'
import {
  formatTime, formatPace,
  type FiveKEstimate,
  type EasyRunEfficiency,
  type LongRunAnalysis,
  type RaceResultAnalysis,
  type EstimateSource,
} from '@/lib/analysis'
import { speedToPace, formatDuration, vdotFrom5K, toJakartaDate, paceUnitLabel, formatDistanceShort, type DistanceUnit } from '@/lib/utils'
import { distanceLabel } from '@/lib/goals'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'
import ToggleAnalysisButton from '@/components/ToggleAnalysisButton'
import CollapsibleRuns from '@/components/CollapsibleRuns'
import AnalysisDistanceSection from '@/components/AnalysisDistanceSection'
import AthleteFeaturesSection from '@/components/AthleteFeaturesSection'
import SessionDetailsDisclosure from '@/components/SessionDetailsDisclosure'
import { AnalysisTabProvider } from '@/components/AnalysisTabContext'
import SourceEstimateBadge from '@/components/SourceEstimateBadge'
import RunEstimateBadge from '@/components/RunEstimateBadge'
import RepTableClient from '@/components/RepTableClient'
import { fetchDeltas, saveSnapshot, type AllDeltas } from '@/lib/estimateSnapshots'
import { getAthleteAnalysis } from '@/lib/analysis/service'

export const revalidate = 60

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
    snapshotExtras,
    projection,
  } = await getAthleteAnalysis(Number(athleteId), {
    easyLookbackMonths: 3,
    longLimit: 15,
    raceLimit: 10,
    allActivitiesLimit: 200,
  })

  const { intervalEstimates, thresholdEstimates, longRunAnalyses, raceAnalyses, easyRunResults, longRunEfficiencyPoints, combined, allRaceEstimates } = result
  // Unified aerobic dataset: easy runs + long run steady portions (same chart, same series)
  const easyOnly = easyRunResults.filter(r => !r.excludedReason && !(r as any).runKind)
  const allAerobicEstimates = [...easyOnly, ...(longRunEfficiencyPoints ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
  const easyRunResultsWithRuns = (easyRuns ?? []).map((r: any) => ({
    run: r,
    result: easyRunResults.find(e => e.activityId === r.id) ?? null,
  }))

  // Fetch historical deltas (cheap indexed query) + save today's snapshot (non-blocking)
  await saveSnapshot(Number(athleteId), currentEstimates, snapshotExtras ?? undefined)
  const allDeltas: AllDeltas = await fetchDeltas(Number(athleteId), currentEstimates)

  // Default 5K target
  const TARGET_5K = targetSecsMap['5k'] ?? (22 * 60 + 30)

  function WorkRestStats({ est, isThreshold }: {
    est: { totalWorkSecs: number; totalRestSecs: number; workRestRatio: number; correctionFactor: number; effortsUsed: number; isContinuous?: boolean }
    isThreshold?: boolean
  }) {
    const isContinuousThreshold = isThreshold && est.isContinuous
    return (
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="bg-[#111] rounded-lg px-3 py-2">
          <div className="text-[#4b5563] mb-0.5">Work : Rest</div>
          <div className="font-mono text-white font-bold">
            {formatDuration(est.totalWorkSecs)} : {est.totalRestSecs > 0 ? formatDuration(est.totalRestSecs) : '—'}
          </div>
          <div className="text-[#4b5563] mt-0.5">
            {est.isContinuous ? 'continuous run' : est.totalRestSecs > 0
              ? `${formatDuration(Math.round(est.totalRestSecs / est.effortsUsed))} rest/rep`
              : 'no rest detected'}
          </div>
        </div>
        {isContinuousThreshold ? (
          <div className="bg-[#111] rounded-lg px-3 py-2">
            <div className="text-[#4b5563] mb-0.5">Intensity ratio</div>
            <div className="font-mono text-blue-400 font-bold">{(est.correctionFactor * 100).toFixed(1)}%</div>
            <div className="text-[#4b5563] mt-0.5">tempo → 5K</div>
          </div>
        ) : (
          <div className="bg-[#111] rounded-lg px-3 py-2">
            <div className="text-[#4b5563] mb-0.5">Rest correction</div>
            <div className="font-mono text-orange-400 font-bold">+{((est.correctionFactor - 1) * 100).toFixed(1)}%</div>
            <div className="text-[#4b5563] mt-0.5">added to estimate</div>
          </div>
        )}
        <div className="bg-[#111] rounded-lg px-3 py-2">
          <div className="text-[#4b5563] mb-0.5">Efforts</div>
          <div className="font-mono text-white font-bold">{est.effortsUsed}</div>
          <div className="text-[#4b5563] mt-0.5">{est.isContinuous ? 'continuous' : 'reps'}</div>
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
      <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">No lap data.</div>
    )
    return (
      <div className="bg-[#111] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1c1c1c]">
              {[laps.length > 0 ? 'Lap' : (unit === 'miles' ? 'mi' : 'km'), 'Dist', 'Pace', 'Time', 'HR'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[#4b5563] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayLaps.map((lap: any, i: number) => {
              if (!lap.average_speed) return null
              const lapPace = 1000 / lap.average_speed
              const isWarmCool = lapPace > avgPace + 20
              return (
                <tr key={i} className="border-b border-[#1a1a1a]">
                  <td className={`px-3 py-2 font-mono ${isWarmCool ? 'text-[#3a3a3a]' : 'text-[#6b7280]'}`}>{i+1}</td>
                  <td className={`px-3 py-2 font-mono ${isWarmCool ? 'text-[#3a3a3a]' : 'text-white'}`}>
                    {lap.distance >= 1000 ? formatDistanceShort(lap.distance, unit) : `${Math.round(lap.distance)}m`}
                  </td>
                  <td className={`px-3 py-2 font-mono font-bold ${isWarmCool ? 'text-[#3a3a3a]' : 'text-white'}`}>{speedToPace(lap.average_speed, unit)}{paceUnitLabel(unit)}</td>
                  <td className={`px-3 py-2 font-mono ${isWarmCool ? 'text-[#3a3a3a]' : 'text-[#9ca3af]'}`}>{formatDuration(lap.moving_time)}</td>
                  <td className={`px-3 py-2 font-mono ${isWarmCool ? 'text-[#3a3a3a]' : 'text-[#9ca3af]'}`}>{lap.average_heartrate ? `${Math.round(lap.average_heartrate)}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 text-[10px] text-[#4b5563]">Greyed laps = warmup/cooldown</div>
      </div>
    )
  }

  return (
    <>
      <Nav />
      <AnalysisTabProvider>
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold text-4xl mb-1">Race Analysis</h1>
          <p className="text-[#6b7280] text-sm max-w-3xl">
            {projection
              ? 'Critical-pace fit across your best efforts, plus aerobic, endurance, and form features — projected to today and ideal conditions with a confidence band.'
              : 'Multi-distance estimates from intervals, tempo, long runs, easy trends, and race results — combined with confidence and recency weighting.'}
          </p>
          {!hasMaxHr && (
            <div className="flex items-center gap-2 bg-[#1a1a0a] border border-[#f97316]/30 rounded-xl px-4 py-3 mt-4 text-sm max-w-xl">
              <span className="text-[#f97316] shrink-0">⚠</span>
              <span className="text-[#9ca3af]">HR-based corrections use a default max HR of 195 bpm — open <span className="text-white font-medium">Settings</span> (gear icon) to add your actual max HR.</span>
            </div>
          )}
        </div>

        {/* Distance Tabs + Combined Estimate + Source Cards */}
        <AnalysisDistanceSection
          combined={combinedJson}
          targetSecsMap={targetSecsMap}
          allDeltas={allDeltas}
          extrasMap={snapshotExtras ? Object.fromEntries(
            Object.entries(snapshotExtras).map(([dk, e]) => [dk, {
              idealSecs: e.idealSecs ?? null,
              todaySecs: e.todaySecs ?? null,
              p80LowSecs: e.p80LowSecs ?? null,
              p80HighSecs: e.p80HighSecs ?? null,
            }])
          ) : null}
        />

        {/* New: feature-based fitness profile (Speed / Aerobic / Endurance / Form).
            Only renders when the CP engine has produced a projection — legacy mode
            falls back to surfacing only the per-source detail below. */}
        {projection && <AthleteFeaturesSection projection={projection} />}

        {/* Per-session breakdowns — kept for power-user inspection, collapsed by default. */}
        <SessionDetailsDisclosure
          count={(intervalRuns?.length ?? 0) + (thresholdRuns?.length ?? 0) + (longRuns?.length ?? 0) + (easyRuns?.length ?? 0)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">

            {/* COL 1: Intervals */}
            <div className="flex flex-col gap-4">
              <div className="card fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Intervals</h2>
                    <p className="text-[#4b5563] text-xs mt-0.5">{intervalEstimates.length} session{intervalEstimates.length !== 1 ? 's' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="interval" color="#f97316" label="intervals" />
                </div>
                <FiveKTrendChart estimates={intervalEstimates} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} color="#f97316" />
              </div>
              {intervalEstimates.length === 0 && (
                <div className="card text-center py-10 text-[#6b7280] text-sm">
                  Tag runs as &quot;Interval 5K&quot; to see estimates.
                </div>
              )}
              <CollapsibleRuns count={(intervalRuns ?? []).length} color="#f97316">
                {(intervalRuns ?? []).map((run: any) => {
                  const estimate = intervalEstimates.find(e => e.activityId === run.id)
                  return (
                    <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-display font-bold text-base">{run.name}</span>
                            <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                          </div>
                          <div className="text-[#6b7280] text-xs mt-0.5">{format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}</div>
                        </div>
                        {estimate ? (
                          <RunEstimateBadge raceEstimates={estimate.raceEstimates} fallbackSecs={estimate.estimatedSecs} color="#f97316" />
                        ) : <div className="text-[#4b5563] text-xs pt-1">No hard efforts detected</div>}
                      </div>
                      {estimate && <WorkRestStats est={estimate} />}
                      {estimate && <RepTableClient efforts={estimate.allEfforts} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} unit={unit} />}
                      {estimate?.repDrift?.reliable && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="text-[#4b5563]">Rep drift</span>
                          <span className={`font-mono font-bold ${estimate.repDrift.excessDrift > 1 ? 'text-orange-400' : estimate.repDrift.excessDrift < -0.5 ? 'text-emerald-400' : 'text-[#6b7280]'}`}>
                            {estimate.repDrift.drift.toFixed(1)}%
                          </span>
                          <span className={`text-[10px] ${estimate.repDrift.excessDrift > 1 ? 'text-orange-400' : estimate.repDrift.excessDrift < -0.5 ? 'text-emerald-400' : 'text-[#4b5563]'}`}>
                            ({estimate.repDrift.excessDrift > 0 ? '+' : ''}{estimate.repDrift.excessDrift.toFixed(1)}% vs expected
                            {estimate.repDrift.paceAdjusted ? ', pace-adj.' : ''})
                          </span>
                          <span className="text-[#4b5563] ml-auto">rep 1: {Math.round(estimate.repDrift.firstRepHR)} bpm → last: {Math.round(estimate.repDrift.lastRepHR)} bpm</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CollapsibleRuns>
            </div>

            {/* COL 2: Tempo */}
            <div className="flex flex-col gap-4">
              <div className="card fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Tempo</h2>
                    <p className="text-[#4b5563] text-xs mt-0.5">{thresholdEstimates.length} session{thresholdEstimates.length !== 1 ? 's' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="threshold" color="#60a5fa" label="tempo" />
                </div>
                <FiveKTrendChart estimates={thresholdEstimates} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} color="#60a5fa" />
              </div>
              {thresholdEstimates.length === 0 && (
                <div className="card text-center py-10 text-[#6b7280] text-sm">
                  Tag runs as &quot;Threshold&quot; or &quot;Tempo&quot; to see estimates.
                </div>
              )}
              {(() => {
                const fastBlockCards = thresholdEstimates.filter(e => (e as any).isLongRunFastBlock)
                // Merge regular threshold runs and fast block cards, sort chronologically DESC
                type TempoItem =
                  | { kind: 'run'; run: any; date: string }
                  | { kind: 'fb';  est: FiveKEstimate; date: string }
                const items: TempoItem[] = [
                  ...(thresholdRuns ?? []).map((run: any) => ({ kind: 'run' as const, run, date: run.start_date as string })),
                  ...fastBlockCards.map(est => ({ kind: 'fb' as const, est, date: est.date + 'T12:00:00' })),
                ].sort((a, b) => b.date.localeCompare(a.date))

                return (
                  <CollapsibleRuns count={items.length} color="#60a5fa">
                    {items.map(item => {
                      if (item.kind === 'run') {
                        const run = item.run
                        const estimate = thresholdEstimates.find(e => e.activityId === run.id && !(e as any).isLongRunFastBlock)
                        return (
                          <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                            <div className="flex items-start justify-between gap-4 mb-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-display font-bold text-base">{run.name}</span>
                                  <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                                </div>
                                <div className="text-[#6b7280] text-xs mt-0.5">{format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}</div>
                              </div>
                              {estimate ? (
                                <RunEstimateBadge raceEstimates={estimate.raceEstimates} fallbackSecs={estimate.estimatedSecs} color="#60a5fa" />
                              ) : <div className="text-[#4b5563] text-xs pt-1">Could not estimate</div>}
                            </div>
                            {estimate && <WorkRestStats est={estimate} isThreshold />}
                            {estimate && !estimate.isContinuous && <RepTableClient efforts={estimate.allEfforts} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} unit={unit} />}
                            {estimate && estimate.isContinuous && <ContinuousRunTable run={run} />}
                            {estimate?.repDrift?.reliable && (
                              <div className="mt-2 flex items-center gap-2 text-xs">
                                <span className="text-[#4b5563]">Rep drift</span>
                                <span className={`font-mono font-bold ${estimate.repDrift.excessDrift > 1 ? 'text-orange-400' : estimate.repDrift.excessDrift < -0.5 ? 'text-emerald-400' : 'text-[#6b7280]'}`}>
                                  {estimate.repDrift.drift.toFixed(1)}%
                                </span>
                                <span className={`text-[10px] ${estimate.repDrift.excessDrift > 1 ? 'text-orange-400' : estimate.repDrift.excessDrift < -0.5 ? 'text-emerald-400' : 'text-[#4b5563]'}`}>
                                  ({estimate.repDrift.excessDrift > 0 ? '+' : ''}{estimate.repDrift.excessDrift.toFixed(1)}% vs expected
                                  {estimate.repDrift.paceAdjusted ? ', pace-adj.' : ''})
                                </span>
                                <span className="text-[#4b5563] ml-auto">rep 1: {Math.round(estimate.repDrift.firstRepHR)} bpm → last: {Math.round(estimate.repDrift.lastRepHR)} bpm</span>
                              </div>
                            )}
                          </div>
                        )
                      }
                      // Fast block from long run
                      const est = item.est
                      const lr = longRunAnalyses.find(l => l.activityId === est.activityId)
                      const lrRun = (longRuns ?? []).find((r: any) => r.id === est.activityId)
                      const blocks = lr?.allFastBlocks?.length ? lr.allFastBlocks : (lr?.fastBlock ? [lr.fastBlock] : [])
                      return (
                        <div key={`fb-${est.activityId}`} className={`card fade-up ${lrRun?.excluded_from_analysis ? 'opacity-40' : ''}`}>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-display font-bold text-base">{est.activityName.replace(' (fast block)', '')}</span>
                                <ToggleAnalysisButton activityId={est.activityId} excluded={!!lrRun?.excluded_from_analysis} />
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-[#34d399] bg-[#34d39920]">long run fast block</span>
                              </div>
                              <div className="text-[#6b7280] text-xs mt-0.5">
                                {format(parseISO(est.date + 'T12:00:00'), 'EEE, MMM d yyyy')} · {formatDistanceShort(lrRun?.distance ?? 0, unit)}
                                {lr?.fatigueCredit != null && lr.fatigueCredit > 0 && (
                                  <span className="ml-2 text-emerald-400 font-mono">+{lr.fatigueCredit.toFixed(1)}s fatigue credit</span>
                                )}
                              </div>
                            </div>
                            <RunEstimateBadge raceEstimates={est.raceEstimates} fallbackSecs={est.estimatedSecs} color="#60a5fa" />
                          </div>
                          {blocks.length > 0 && (
                            <div className="bg-[#111] rounded-lg overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-[#1c1c1c]">
                                    {['Block', 'Pace', 'Duration', 'HR', 'Est HM'].map(h => (
                                      <th key={h} className="text-left px-3 py-2 text-[#4b5563] font-medium">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {blocks.map((block, i) => {
                                    const isPrimary = block.startSec === lr?.fastBlock?.startSec
                                    const hmEst = isPrimary ? lr?.fastBlockEstimates?.find(e => e.distanceKey === 'hm') : undefined
                                    return (
                                      <tr key={i} className="border-b border-[#1a1a1a]">
                                        <td className="px-3 py-2 font-mono text-[#6b7280]">
                                          min {Math.round(block.startSec/60)}–{Math.round(block.endSec/60)}
                                          {isPrimary && blocks.length > 1 && <span className="ml-1 text-[10px] text-blue-400">★</span>}
                                        </td>
                                        <td className="px-3 py-2 font-mono font-bold text-[#60a5fa]">{formatPace(block.avgPace)}/km</td>
                                        <td className="px-3 py-2 font-mono text-white">{formatDuration(block.durationSecs)}</td>
                                        <td className="px-3 py-2 font-mono text-[#9ca3af]">{block.avgHR > 0 ? `${Math.round(block.avgHR)} bpm` : '—'}</td>
                                        <td className="px-3 py-2 font-mono text-white">{hmEst ? formatTime(hmEst.estimatedSecs) : '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                              {lr?.fatigueCredit != null && lr.fatigueCredit > 0 && (
                                <div className="px-3 py-2 text-[10px] text-[#4b5563]">★ = primary block used for estimates · Est HM uses +{lr.fatigueCredit.toFixed(1)}s/km fatigue credit</div>
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

            {/* COL 3: Aerobic Efficiency */}
            <div className="flex flex-col gap-4">
              <div className="card fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Aerobic Efficiency</h2>
                    <p className="text-[#4b5563] text-xs mt-0.5">{allAerobicEstimates.length} run{allAerobicEstimates.length !== 1 ? 's' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="easy_trend" color="#a78bfa" label="easy trend" />
                </div>
                <AerobicEfficiencyChart runs={allAerobicEstimates} />
              </div>
              {(() => {
                // Long run IDs that feed the aerobic chart
                const longRunIds = new Set((longRunEfficiencyPoints ?? []).map(p => p.activityId))
                const longRunsForAerobic = (longRuns ?? []).filter((r: any) => longRunIds.has(r.id))
                const easyCards = easyRunResultsWithRuns
                const totalAerobicCount = easyCards.length + longRunsForAerobic.length
                return (
                  <CollapsibleRuns count={totalAerobicCount} color="#a78bfa">
                    {/* Easy run cards */}
                    {easyCards.map(({ run, result: eff }) => {
                      const durationMins = run.moving_time / 60
                      return (
                        <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-display font-bold text-base">{run.name}</span>
                                <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} autoExcludedReason={eff?.excludedReason} />
                              </div>
                              <div className="text-[#6b7280] text-xs mt-0.5">
                                {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}
                                {run.run_type && <span className="ml-2 text-purple-400 capitalize">{run.run_type.replace(/_/g, ' ')}</span>}
                              </div>
                            </div>
                            {eff && !eff.excludedReason ? (
                              <div className="text-right shrink-0">
                                <div className="stat-num text-xl font-bold text-purple-400">{speedToPace(1000/eff.normalizedPaceSec, unit)}{paceUnitLabel(unit)}</div>
                                <div className="text-[#6b7280] text-xs">@ 150 bpm</div>
                              </div>
                            ) : null}
                          </div>
                          {eff && !eff.excludedReason && (() => {
                            const wHR = (eff as any).windowHR ?? eff.avgHR
                            const wPace = (eff as any).windowPace ?? eff.avgPaceSecPerKm
                            const hrAdj = eff.slope * (150 - wHR)  // sec/km added to window pace
                            const credit = 10 * Math.log2(Math.max(durationMins, 5) / 45)
                            const excess = eff.driftExcessPct ?? 0
                            const hmPenaltyPct = Math.min(8, Math.max(0, excess) * 0.7 * 1.5)
                            const fmPenaltyPct = Math.min(8, Math.max(0, excess) * 1.0 * 1.5)
                            return (
                              <div className="space-y-2 text-xs mt-1">
                                <div className="grid grid-cols-3 gap-2">
                                  {/* Sub-card: HR normalization */}
                                  <div className="bg-[#111] rounded-lg px-2 py-2">
                                    <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">HR norm.</div>
                                    <div className="font-mono text-white font-bold">{speedToPace(1000/wPace, unit)}{paceUnitLabel(unit)}</div>
                                    <div className="text-[#4b5563] text-[10px]">{Math.round(wHR)} bpm</div>
                                    <div className={`font-mono font-bold text-[11px] mt-1 ${hrAdj < 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                      {hrAdj > 0 ? '+' : ''}{hrAdj.toFixed(1)}s/km
                                    </div>
                                    <div className="text-[#4b5563] text-[10px]">{Math.round(wHR)} → 150 bpm</div>
                                  </div>
                                  {/* Sub-card: Duration credit */}
                                  <div className="bg-[#111] rounded-lg px-2 py-2">
                                    <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">Duration</div>
                                    <div className="font-mono text-white font-bold">{Math.round(durationMins)} min</div>
                                    <div className="text-[#4b5563] text-[10px]">ref: 45 min</div>
                                    <div className={`font-mono font-bold text-[11px] mt-1 ${credit >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                      {credit >= 0 ? '−' : '+'}{Math.abs(credit).toFixed(1)}s/km
                                    </div>
                                    <div className="text-[#4b5563] text-[10px]">{credit >= 0 ? 'credit' : 'penalty'}</div>
                                  </div>
                                  {/* Sub-card: Drift */}
                                  <div className="bg-[#111] rounded-lg px-2 py-2">
                                    <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">Drift</div>
                                    {eff.driftReliable ? (
                                      <>
                                        <div className={`font-mono font-bold ${excess > 1 ? 'text-orange-400' : excess < -0.5 ? 'text-emerald-400' : 'text-white'}`}>
                                          {eff.driftRawPct?.toFixed(1)}%
                                        </div>
                                        <div className={`text-[10px] ${excess > 1 ? 'text-orange-400' : excess < -0.5 ? 'text-emerald-400' : 'text-[#4b5563]'}`}>
                                          {excess > 0 ? '+' : ''}{excess.toFixed(1)}% excess
                                        </div>
                                        <div className="mt-1 space-y-0.5">
                                          <div className={`text-[10px] font-mono ${hmPenaltyPct > 0 ? 'text-orange-400' : 'text-[#4b5563]'}`}>
                                            HM {hmPenaltyPct > 0 ? `+${hmPenaltyPct.toFixed(1)}%` : '—'}
                                          </div>
                                          <div className={`text-[10px] font-mono ${fmPenaltyPct > 0 ? 'text-orange-400' : 'text-[#4b5563]'}`}>
                                            FM {fmPenaltyPct > 0 ? `+${fmPenaltyPct.toFixed(1)}%` : '—'}
                                          </div>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-[#4b5563] text-[10px] leading-relaxed">Need ≥35 min run with HR</div>
                                    )}
                                  </div>
                                </div>
                                {/* Drift window detail — only when reliable */}
                                {eff.driftReliable && (eff.driftEarlyWindow || eff.driftLateWindow) && (
                                  <div className="flex gap-2">
                                    {eff.driftEarlyWindow && (
                                      <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2 flex-1">
                                        <div className="text-[#4b5563] mb-0.5">Early · min {Math.round(eff.driftEarlyWindow.startSec/60)}–{Math.round(eff.driftEarlyWindow.endSec/60)}</div>
                                        <div className="font-mono font-bold text-white">{formatPace(eff.driftEarlyWindow.avgPace)}/km</div>
                                        <div className="text-[#4b5563] mt-0.5">@ {Math.round(eff.driftEarlyWindow.avgHR)} bpm</div>
                                      </div>
                                    )}
                                    {eff.driftLateWindow && (
                                      <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2 flex-1">
                                        <div className="text-[#4b5563] mb-0.5">
                                          Late · min {Math.round(eff.driftLateWindow.startSec/60)}–{Math.round(eff.driftLateWindow.endSec/60)}
                                          {eff.driftLateWindow.adjustedHR != null && <span className="ml-1 text-yellow-500">adj.</span>}
                                        </div>
                                        <div className="font-mono font-bold text-white">{formatPace(eff.driftLateWindow.avgPace)}/km</div>
                                        {eff.driftLateWindow.adjustedHR != null ? (
                                          <div className="mt-0.5">
                                            <span className="text-[#4b5563]">{Math.round(eff.driftLateWindow.avgHR)} bpm</span>
                                            <span className={`ml-1 font-mono font-bold ${excess > 1 ? 'text-orange-400' : 'text-emerald-400'}`}>→ {Math.round(eff.driftLateWindow.adjustedHR)} adj.</span>
                                          </div>
                                        ) : (
                                          <div className={`mt-0.5 font-mono ${excess > 1 ? 'text-orange-400' : 'text-[#4b5563]'}`}>@ {Math.round(eff.driftLateWindow.avgHR)} bpm</div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                          {eff?.excludedReason && (
                            <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">{eff.excludedReason}</div>
                          )}
                        </div>
                      )
                    })}
                    {/* Long run cards with drift analysis */}
                    {longRunsForAerobic.map((run: any) => {
                      const a = longRunAnalyses.find(lr => lr.activityId === run.id)
                      const effPoint = (longRunEfficiencyPoints ?? []).find(p => p.activityId === run.id)
                      const overallRunPace = run.average_speed ? 1000 / run.average_speed : null
                      // Use total run duration (matches analysis.ts which uses total for duration credit)
                      const durationMins = run.moving_time / 60
                      return (
                        <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-display font-bold text-base">{run.name}</span>
                                <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                              </div>
                              <div className="text-[#6b7280] text-xs mt-0.5">
                                {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}
                                {a && <span className="ml-2 text-emerald-400 capitalize">{a.runStructure === 'fast_middle' ? 'fast block' : a.runStructure}</span>}
                              </div>
                            </div>
                            {effPoint && (
                              <div className="text-right shrink-0">
                                <div className="stat-num text-xl font-bold text-purple-400">{speedToPace(1000/effPoint.normalizedPaceSec, unit)}{paceUnitLabel(unit)}</div>
                                <div className="text-[#6b7280] text-xs">steady @ 150 bpm</div>
                              </div>
                            )}
                          </div>
                          {a && (() => {
                            const hrAdj = -2.5 * (150 - a.steadyHR)  // AEROBIC_SLOPE * (REF_HR - steadyHR)
                            const credit = 10 * Math.log2(Math.max(durationMins, 5) / 45)
                            const excess = a.driftExcess ?? 0
                            const hmPenaltyPct = Math.min(8, Math.max(0, excess) * 0.7 * 1.5)
                            const fmPenaltyPct = Math.min(8, Math.max(0, excess) * 1.0 * 1.5)
                            return (
                              <div className="space-y-2 text-xs mt-1">
                                <div className="grid grid-cols-3 gap-2">
                                  {/* Sub-card: HR normalization */}
                                  <div className="bg-[#111] rounded-lg px-2 py-2">
                                    <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">HR norm.</div>
                                    <div className="font-mono text-white font-bold">{formatPace(a.steadyPace)}/km</div>
                                    <div className="text-[#4b5563] text-[10px]">{Math.round(a.steadyHR)} bpm</div>
                                    <div className={`font-mono font-bold text-[11px] mt-1 ${hrAdj < 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                      {hrAdj > 0 ? '+' : ''}{hrAdj.toFixed(1)}s/km
                                    </div>
                                    <div className="text-[#4b5563] text-[10px]">{Math.round(a.steadyHR)} → 150 bpm</div>
                                  </div>
                                  {/* Sub-card: Duration credit */}
                                  <div className="bg-[#111] rounded-lg px-2 py-2">
                                    <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">Duration</div>
                                    <div className="font-mono text-white font-bold">{Math.round(durationMins)} min</div>
                                    <div className="text-[#4b5563] text-[10px]">ref: 45 min</div>
                                    <div className={`font-mono font-bold text-[11px] mt-1 ${credit >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                      {credit >= 0 ? '−' : '+'}{Math.abs(credit).toFixed(1)}s/km
                                    </div>
                                    <div className="text-[#4b5563] text-[10px]">{credit >= 0 ? 'credit' : 'penalty'}</div>
                                  </div>
                                  {/* Sub-card: Drift */}
                                  <div className="bg-[#111] rounded-lg px-2 py-2">
                                    <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">Drift</div>
                                    {a.driftReliable ? (
                                      <>
                                        <div className={`font-mono font-bold ${excess > 1 ? 'text-orange-400' : excess < -0.5 ? 'text-emerald-400' : 'text-white'}`}>
                                          {a.cardiacDrift.toFixed(1)}%
                                        </div>
                                        <div className={`text-[10px] ${excess > 1 ? 'text-orange-400' : excess < -0.5 ? 'text-emerald-400' : 'text-[#4b5563]'}`}>
                                          {excess > 0 ? '+' : ''}{excess.toFixed(1)}% excess
                                        </div>
                                        <div className="mt-1 space-y-0.5">
                                          <div className={`text-[10px] font-mono ${hmPenaltyPct > 0 ? 'text-orange-400' : 'text-[#4b5563]'}`}>
                                            HM {hmPenaltyPct > 0 ? `+${hmPenaltyPct.toFixed(1)}%` : '—'}
                                          </div>
                                          <div className={`text-[10px] font-mono ${fmPenaltyPct > 0 ? 'text-orange-400' : 'text-[#4b5563]'}`}>
                                            FM {fmPenaltyPct > 0 ? `+${fmPenaltyPct.toFixed(1)}%` : '—'}
                                          </div>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-[#4b5563] text-[10px] leading-relaxed">{a.driftReason ?? 'unreliable'}</div>
                                    )}
                                  </div>
                                </div>
                                {(a.earlyWindow || a.lateWindow) && (
                                  <div className="flex gap-2">
                                    {a.earlyWindow && (
                                      <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2 flex-1">
                                        <div className="text-[#4b5563] mb-0.5">Early · min {Math.round(a.earlyWindow.startSec/60)}–{Math.round(a.earlyWindow.endSec/60)}</div>
                                        <div className="font-mono font-bold text-white">{formatPace(a.earlyWindow.avgPace)}/km</div>
                                        <div className="text-[#4b5563] mt-0.5">@ {Math.round(a.earlyWindow.avgHR)} bpm</div>
                                      </div>
                                    )}
                                    {a.lateWindow && (
                                      <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2 flex-1">
                                        <div className="text-[#4b5563] mb-0.5">
                                          Late · min {Math.round(a.lateWindow.startSec/60)}–{Math.round(a.lateWindow.endSec/60)}
                                          {a.driftPaceAdjusted && <span className="ml-1 text-yellow-500">adj.</span>}
                                        </div>
                                        <div className="font-mono font-bold text-white">{formatPace(a.lateWindow.avgPace)}/km</div>
                                        {a.lateWindow.adjustedHR != null ? (
                                          <div className="mt-0.5">
                                            <span className="text-[#4b5563]">{Math.round(a.lateWindow.avgHR)} bpm</span>
                                            <span className={`ml-1 font-mono font-bold ${excess > 1 ? 'text-orange-400' : 'text-emerald-400'}`}>→ {Math.round(a.lateWindow.adjustedHR)} adj.</span>
                                          </div>
                                        ) : (
                                          <div className={`mt-0.5 font-mono ${excess > 1 ? 'text-orange-400' : 'text-[#4b5563]'}`}>@ {Math.round(a.lateWindow.avgHR)} bpm</div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </CollapsibleRuns>
                )
              })()}
            </div>

          </div>
        </SessionDetailsDisclosure>

        {/* Race Results — below the grid */}
        {raceAnalyses.length > 0 && (
          <div className="mt-6 max-w-sm">
            <div className="card fade-up">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Race Results</h2>
                <span className="text-xs text-[#4b5563]">{raceAnalyses.length} races</span>
              </div>
              <p className="text-[#4b5563] text-xs mb-4">Gold standard — direct race performance</p>
              <div className="space-y-3">
                {raceAnalyses.map(race => (
                  <div key={race.activityId} className="bg-[#111] rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[#f472b6]">{race.activityName}</span>
                      <span className="text-[#6b7280] font-mono">{race.date}</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-white font-bold">{distanceLabel(race.matchedDistanceKey)}</span>
                      <span className="text-[#f472b6] font-mono font-bold">{formatTime(race.raceTimeSecs)}</span>
                      <span className="text-emerald-400 font-mono text-[10px]">0.98 conf.</span>
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
