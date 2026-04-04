import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import FiveKTrendChart from '@/components/FiveKTrendChart'
import AerobicEfficiencyChart from '@/components/AerobicEfficiencyChart'
import {
  analyzeAllAndCombine,
  formatTime, formatPace,
  type FiveKEstimate,
  type EasyRunEfficiency,
  type LongRunAnalysis,
  type RaceResultAnalysis,
  type CombinedEstimate,
  type EstimateSource,
} from '@/lib/analysis'
import { speedToPace, formatDuration, vdotFrom5K, toJakartaDate, paceUnitLabel, formatDistanceShort, type DistanceUnit } from '@/lib/utils'
import { type DistanceKey, distanceLabel } from '@/lib/goals'
import { format, subMonths } from 'date-fns'
import Link from 'next/link'
import ToggleAnalysisButton from '@/components/ToggleAnalysisButton'
import CollapsibleRuns from '@/components/CollapsibleRuns'
import LongRunChart from '@/components/LongRunChart'
import AnalysisDistanceSection from '@/components/AnalysisDistanceSection'
import { AnalysisTabProvider } from '@/components/AnalysisTabContext'
import SourceEstimateBadge from '@/components/SourceEstimateBadge'
import RunEstimateBadge from '@/components/RunEstimateBadge'
import RepTableClient from '@/components/RepTableClient'

export const revalidate = 60

const EASY_RUN_TYPES = ['easy', 'easy_strides', 'long_easy', 'recovery']

export default async function AnalysisPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  const [{ data: goalRows }, { data: userProfile }] = await Promise.all([
    supabaseAdmin.from('user_goals').select('distance_key, target_secs').eq('athlete_id', parseInt(athleteId)),
    supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', athleteId).maybeSingle(),
  ])
  const maxHr: number | undefined = userProfile?.max_hr ?? undefined
  const targetSecsMap: Record<string, number> = {}
  for (const g of goalRows ?? []) {
    targetSecsMap[g.distance_key] = g.target_secs
  }

  const [{ data: intervalRuns }, { data: thresholdRuns }, { data: longRuns }, { data: easyRuns }, { data: allActivities }] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('run_type', 'interval_5k').order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('run_type', 'threshold').order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['long', 'long_easy', 'long_progressive']).order('start_date', { ascending: false }).limit(15),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', EASY_RUN_TYPES).gte('start_date', subMonths(new Date(), 3).toISOString()).order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('start_date, run_type, distance').eq('athlete_id', athleteId).eq('type', 'Run').not('run_type', 'is', null).order('start_date', { ascending: false }).limit(200),
  ])

  // Race query is separate — is_race column may not exist before migration_008
  let raceRuns: any[] = []
  try {
    const { data } = await supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('is_race', true).order('start_date', { ascending: false }).limit(10)
    raceRuns = data ?? []
  } catch { /* column doesn't exist yet — ignore */ }

  let result: ReturnType<typeof analyzeAllAndCombine>
  try {
    result = analyzeAllAndCombine(
      intervalRuns ?? [],
      thresholdRuns ?? [],
      longRuns ?? [],
      easyRuns ?? [],
      raceRuns,
      maxHr ?? 195,
      allActivities ?? [],
    )
  } catch (err) {
    console.error('analyzeAllAndCombine failed:', err)
    result = {
      intervalEstimates: [], thresholdEstimates: [], longRunAnalyses: [],
      raceAnalyses: [], easyRunResults: [], easyTrendEstimates: [],
      allRaceEstimates: [],
      combined: { '5k': null, '10k': null, 'hm': null, 'fm': null },
    }
  }

  const { intervalEstimates, thresholdEstimates, longRunAnalyses, raceAnalyses, easyRunResults, combined, allRaceEstimates } = result
  const easyEstimates = easyRunResults.filter(r => !r.excludedReason)
  const easyRunResultsWithRuns = (easyRuns ?? []).map((r: any) => ({
    run: r,
    result: easyRunResults.find(e => e.activityId === r.id) ?? null,
  }))

  // Serialise combined for client components
  const combinedJson = JSON.parse(JSON.stringify(combined)) as Record<DistanceKey, CombinedEstimate | null>

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
            <div className="text-[#4b5563] mt-0.5">threshold → 5K</div>
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
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold text-4xl mb-1">Race Analysis</h1>
          <p className="text-[#6b7280] text-sm max-w-3xl">
            Multi-distance estimates from intervals, threshold, long runs, easy trends, and race results — combined with confidence and recency weighting.
          </p>
          {!maxHr && (
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
        />

        {/* Detailed session breakdowns below */}
        <div className="mt-12">
          <h2 className="font-display font-bold text-xl mb-6">Session Details</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">

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
                    </div>
                  )
                })}
              </CollapsibleRuns>
            </div>

            {/* COL 2: Threshold */}
            <div className="flex flex-col gap-4">
              <div className="card fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Threshold</h2>
                    <p className="text-[#4b5563] text-xs mt-0.5">{thresholdEstimates.length} session{thresholdEstimates.length !== 1 ? 's' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="threshold" color="#60a5fa" label="threshold" />
                </div>
                <FiveKTrendChart estimates={thresholdEstimates} targetSecsMap={targetSecsMap} defaultTargetSecs={TARGET_5K} color="#60a5fa" />
              </div>
              {thresholdEstimates.length === 0 && (
                <div className="card text-center py-10 text-[#6b7280] text-sm">
                  Tag runs as &quot;Threshold&quot; to see estimates.
                </div>
              )}
              <CollapsibleRuns count={(thresholdRuns ?? []).length} color="#60a5fa">
                {(thresholdRuns ?? []).map((run: any) => {
                  const estimate = thresholdEstimates.find(e => e.activityId === run.id)
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
                    </div>
                  )
                })}
              </CollapsibleRuns>
            </div>

            {/* COL 3: Aerobic Efficiency */}
            <div className="flex flex-col gap-4">
              <div className="card fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Aerobic Efficiency</h2>
                    <p className="text-[#4b5563] text-xs mt-0.5">{easyEstimates.length} run{easyEstimates.length !== 1 ? 's' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="easy_trend" color="#a78bfa" label="easy trend" />
                </div>
                <AerobicEfficiencyChart runs={easyEstimates} />
              </div>
              <CollapsibleRuns count={easyRunResultsWithRuns.filter(({ result }) => result?.excludedReason !== 'Treadmill run — no GPS pace data').length} color="#a78bfa">
                {easyRunResultsWithRuns.filter(({ result }) => result?.excludedReason !== 'Treadmill run — no GPS pace data').map(({ run, result: eff }) => (
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
                    {eff && !eff.excludedReason && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-[#111] rounded-lg px-2 py-2">
                          <div className="text-[#4b5563] mb-0.5">Last 15 min</div>
                          <div className="font-mono text-white font-bold">{speedToPace(1000/(eff as any).windowPace, unit)}{paceUnitLabel(unit)}</div>
                          <div className="text-[#4b5563] mt-0.5">{Math.round((eff as any).windowHR)} bpm</div>
                        </div>
                        <div className="bg-[#111] rounded-lg px-2 py-2">
                          <div className="text-[#4b5563] mb-0.5">HR adj.</div>
                          <div className={`font-mono font-bold ${eff.avgHR > 150 ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {eff.avgHR > 150 ? '▼' : '▲'}{Math.abs((eff.avgPaceSecPerKm - eff.normalizedPaceSec)).toFixed(1)}s
                          </div>
                          <div className="text-[#4b5563] mt-0.5">→ {speedToPace(1000/eff.normalizedPaceSec, unit)}{paceUnitLabel(unit)}</div>
                        </div>
                        <div className="bg-[#111] rounded-lg px-2 py-2">
                          <div className="text-[#4b5563] mb-0.5">Slope</div>
                          <div className="font-mono text-purple-400 font-bold">{eff.r2 > 0 ? 'regr.' : 'fixed'}</div>
                          <div className="text-[#4b5563] mt-0.5">{eff.r2 > 0 ? `R²=${eff.r2.toFixed(2)}` : '−2.5 s/bpm'}</div>
                        </div>
                      </div>
                    )}
                    {eff?.excludedReason && (
                      <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">{eff.excludedReason}</div>
                    )}
                  </div>
                ))}
              </CollapsibleRuns>
            </div>

            {/* COL 4: Long Runs + Race Results */}
            <div className="flex flex-col gap-4">
              <div className="card fade-up">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Long Runs</h2>
                    <p className="text-[#4b5563] text-xs mt-0.5">{longRunAnalyses.length} run{longRunAnalyses.length !== 1 ? 's' : ''}</p>
                  </div>
                  <SourceEstimateBadge combined={combinedJson} source="long_run" color="#34d399" label="long runs" />
                </div>
                <LongRunChart runs={longRunAnalyses} />
              </div>
              <CollapsibleRuns count={(longRuns ?? []).length} color="#34d399">
                {(longRuns ?? []).map((run: any) => {
                  const a = longRunAnalyses.find(lr => lr.activityId === run.id)
                  const structureColor = a?.runStructure === 'progression' ? 'text-orange-400' : a?.runStructure === 'fast_middle' ? 'text-blue-400' : 'text-[#6b7280]'
                  const structureLabel = a?.runStructure === 'progression' ? 'Progression' : a?.runStructure === 'fast_middle' ? 'Fast block' : 'Steady'
                  const overallRunPace = run.average_speed ? 1000 / run.average_speed : null
                  const hmEst = a?.raceEstimates.find(e => e.distanceKey === 'hm')
                  return (
                    <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-display font-bold text-base">{run.name}</span>
                            <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                          </div>
                          <div className="text-[#6b7280] text-xs mt-0.5">
                            {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy')} · {formatDistanceShort(run.distance, unit)} · {formatDuration(run.moving_time)}
                            {a && <span className={`ml-2 ${structureColor}`}>{structureLabel}</span>}
                          </div>
                        </div>
                        {hmEst && (
                          <div className="text-right shrink-0">
                            <div className="stat-num text-xl font-bold text-emerald-400">{formatTime(hmEst.estimatedSecs)}</div>
                            <div className="text-[#6b7280] text-xs">est. HM</div>
                          </div>
                        )}
                      </div>

                      {a ? (
                        <div className="space-y-2 text-xs">
                          {/* Row 1: overall run reference */}
                          <div className="flex gap-2">
                            <div className="bg-[#111] rounded-lg px-3 py-2 flex-1">
                              <div className="text-[#4b5563] mb-0.5">Overall avg</div>
                              <div className="font-mono font-bold text-white">
                                {overallRunPace ? `${formatPace(overallRunPace)}/km` : '—'}
                              </div>
                              <div className="text-[#4b5563] mt-0.5">@ {run.average_heartrate ? Math.round(run.average_heartrate) : '—'} bpm</div>
                            </div>
                            {/* Drift result */}
                            <div className="bg-[#111] rounded-lg px-3 py-2 flex-1">
                              <div className="text-[#4b5563] mb-0.5">Cardiac drift</div>
                              {a.driftReliable ? (
                                <>
                                  <div className={`font-mono font-bold ${a.cardiacDrift > 3 ? 'text-orange-400' : 'text-emerald-400'}`}>{a.cardiacDrift.toFixed(1)}%</div>
                                  <div className="text-[#4b5563] mt-0.5">{a.cardiacDrift > 3 ? 'elevated' : 'low'}</div>
                                </>
                              ) : (
                                <>
                                  <div className="font-mono font-bold text-[#4b5563]">—</div>
                                  <div className="text-[#4b5563] mt-0.5 leading-tight">{a.driftReason ?? 'unreliable'}</div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Row 2: drift comparison windows */}
                          {(a.earlyWindow || a.lateWindow) && (
                            <div className="flex gap-2">
                              {a.earlyWindow && (
                                <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2 flex-1">
                                  <div className="text-[#4b5563] mb-0.5">
                                    Early window · min {Math.round(a.earlyWindow.startSec/60)}–{Math.round(a.earlyWindow.endSec/60)}
                                  </div>
                                  <div className="font-mono font-bold text-white">{formatPace(a.earlyWindow.avgPace)}/km</div>
                                  <div className="text-[#4b5563] mt-0.5">@ {Math.round(a.earlyWindow.avgHR)} bpm</div>
                                </div>
                              )}
                              {a.lateWindow && (
                                <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2 flex-1">
                                  <div className="text-[#4b5563] mb-0.5">
                                    Late window · min {Math.round(a.lateWindow.startSec/60)}–{Math.round(a.lateWindow.endSec/60)}
                                  </div>
                                  <div className="font-mono font-bold text-white">{formatPace(a.lateWindow.avgPace)}/km</div>
                                  <div className={`mt-0.5 font-mono ${a.driftReliable && a.cardiacDrift > 3 ? 'text-orange-400' : 'text-[#4b5563]'}`}>
                                    @ {Math.round(a.lateWindow.avgHR)} bpm
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Row 3: fast block (if any) */}
                          {a.fastBlock && (
                            <div className="bg-[#0f0f0f] border border-blue-400/20 rounded-lg px-3 py-2">
                              <div className="text-[#4b5563] mb-1">
                                Fast block · min {Math.round(a.fastBlock.startSec/60)}–{Math.round(a.fastBlock.endSec/60)} · {(a.fastBlock.durationSecs/60).toFixed(0)} min · {a.fastBlock.pctFasterThanBaseline.toFixed(0)}% faster than baseline
                              </div>
                              <div className="flex gap-4">
                                <span className="font-mono font-bold text-blue-400">{formatPace(a.fastBlock.avgPace)}/km</span>
                                <span className="text-[#9ca3af]">@ {Math.round(a.fastBlock.avgHR)} bpm</span>
                                {a.fastBlockEstimates?.find(e => e.distanceKey === 'hm') && (
                                  <span className="text-blue-400 font-mono">HM est. {formatTime(a.fastBlockEstimates.find(e => e.distanceKey === 'hm')!.estimatedSecs)}</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Row 4: residual elevation (fast_middle only) */}
                          {a.residualElevation != null && (
                            <div className="bg-[#111] rounded-lg px-3 py-2">
                              <div className="text-[#4b5563] mb-0.5">Post-effort residual HR elevation</div>
                              <div className={`font-mono font-bold ${a.residualElevation > 5 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                +{a.residualElevation.toFixed(1)}%
                              </div>
                              <div className="text-[#4b5563] mt-0.5">HR at easy pace after block recovery vs before</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">Could not analyse — missing HR or split data</div>
                      )}
                    </div>
                  )
                })}
              </CollapsibleRuns>

              {/* Race results */}
              {raceAnalyses.length > 0 && (
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
              )}
            </div>

          </div>
        </div>
      </main>
      </AnalysisTabProvider>
    </>
  )
}
