import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import FiveKTrendChart from '@/components/FiveKTrendChart'
import AerobicEfficiencyChart from '@/components/AerobicEfficiencyChart'
import {
  analyzeAllIntervalSessions,
  analyzeThresholdSession,
  analyzeAllEasyRuns,
  analyzeEasyRun,
  formatTime, formatPace,
  type EasyRunEfficiency,
} from '@/lib/analysis'
import { speedToPace, formatDuration, vdotFrom5K } from '@/lib/utils'
import { format, subMonths } from 'date-fns'
import Link from 'next/link'
import ToggleAnalysisButton from '@/components/ToggleAnalysisButton'
import CollapsibleRuns from '@/components/CollapsibleRuns'

const TARGET_SECS = 22 * 60 + 30
const EASY_RUN_TYPES = ['easy', 'easy_strides', 'long_easy', 'recovery']
const isTreadmill = (run: any) => run.run_type === 'treadmill' || run.raw?.trainer === true

export default async function FiveKAnalysisPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')

  const [{ data: intervalRuns }, { data: thresholdRuns }, { data: easyRuns }] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('run_type', 'interval_5k').order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('run_type', 'threshold').order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', EASY_RUN_TYPES).gte('start_date', subMonths(new Date(), 3).toISOString()).order('start_date', { ascending: false }),
  ])

  const intervalEstimates  = analyzeAllIntervalSessions((intervalRuns ?? []).filter((r: any) => !r.excluded_from_analysis))
  const thresholdEstimates = (thresholdRuns ?? []).filter((r: any) => !r.excluded_from_analysis).map(a => analyzeThresholdSession(a)).filter(Boolean) as NonNullable<ReturnType<typeof analyzeThresholdSession>>[]
  const easyRunResults = (easyRuns ?? []).map((r: any) => ({ run: r, result: analyzeEasyRun(r) }))
  const easyEstimates = easyRunResults
    .filter(({ run, result }) => result && !result.excludedReason && !run.excluded_from_analysis)
    .map(({ result }) => result!)

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

  function RepTable({ efforts, correctionFactor }: { efforts: any[]; correctionFactor: number }) {
    if (efforts.length === 0) return null
    return (
      <div className="bg-[#111] rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1c1c1c]">
              {['Lap', 'Dist', 'Pace', 'Time', 'HR', 'Est. 5K'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[#4b5563] font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {efforts.map((rep: any, i: number) => (
              <tr key={i} className="border-b border-[#1a1a1a]">
                <td className="px-3 py-2 text-[#6b7280] font-mono">{rep.lapIndex}</td>
                <td className="px-3 py-2 font-mono text-white">
                  {rep.distanceM >= 1000 ? `${(rep.distanceM/1000).toFixed(2)}km` : `${Math.round(rep.distanceM)}m`}
                </td>
                <td className="px-3 py-2 font-mono font-bold text-white">{speedToPace(1000/rep.paceSecPerKm)}/km</td>
                <td className="px-3 py-2 font-mono text-[#9ca3af]">{formatDuration(rep.durationSecs)}</td>
                <td className="px-3 py-2 font-mono text-[#9ca3af]">{rep.avgHR ? Math.round(rep.avgHR) : '—'}</td>
                <td className={`px-3 py-2 font-mono font-bold ${rep.correctedSecs <= TARGET_SECS ? 'text-emerald-400' : 'text-white'}`}>
                  {formatTime(rep.correctedSecs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 text-[10px] text-[#4b5563]">
          Est. 5K = rep pace adjusted for rest, duration, and HR · duration-weighted avg
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
      <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">No lap data — use "Sync lap data" on the runs page.</div>
    )
    return (
      <div className="bg-[#111] rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1c1c1c]">
              {[laps.length > 0 ? 'Lap' : 'km', 'Dist', 'Pace', 'Time', 'HR'].map(h => (
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
                    {lap.distance >= 1000 ? `${(lap.distance/1000).toFixed(2)}km` : `${Math.round(lap.distance)}m`}
                  </td>
                  <td className={`px-3 py-2 font-mono font-bold ${isWarmCool ? 'text-[#3a3a3a]' : 'text-white'}`}>{speedToPace(lap.average_speed)}/km</td>
                  <td className={`px-3 py-2 font-mono ${isWarmCool ? 'text-[#3a3a3a]' : 'text-[#9ca3af]'}`}>{formatDuration(lap.moving_time)}</td>
                  <td className={`px-3 py-2 font-mono ${isWarmCool ? 'text-[#3a3a3a]' : 'text-[#9ca3af]'}`}>{lap.average_heartrate ? `${Math.round(lap.average_heartrate)}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 text-[10px] text-[#4b5563]">Greyed laps = warmup/cooldown, excluded from estimate</div>
      </div>
    )
  }



  return (
    <>
      <Nav />
      <main className="max-w-full mx-auto px-6 pt-24 pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold text-3xl leading-normal pb-1 mb-1">5K Fitness Tracker</h1>
          <p className="text-[#6b7280] text-sm max-w-3xl">
            Three independent signals — each uses a different method suited to the run type.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── COL 1: Intervals ── */}
          <div className="flex flex-col gap-4">
            <div className="card fade-up">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Intervals</h2>
                <span className="text-xs text-[#4b5563]">{intervalEstimates.length} sessions</span>
              </div>
              <p className="text-[#4b5563] text-xs mb-5">Rep pace + rest & HR correction</p>
              <FiveKTrendChart estimates={intervalEstimates} targetSecs={TARGET_SECS} color="#f97316" />
            </div>
            {intervalEstimates.length === 0 && (
              <div className="card text-center py-10 text-[#6b7280] text-sm">
                Tag runs as "Interval 5K" on the <Link href="/runs" className="text-[#f97316] hover:underline">Runs page</Link>.
              </div>
            )}
            <CollapsibleRuns count={(intervalRuns ?? []).length} color="#f97316">
            {(intervalRuns ?? []).map((run: any) => {
              const estimate = intervalEstimates.find(e => e.activityId === run.id)
              return (
                <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}` }>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link href={`/runs/${run.id}`} className="font-display font-bold text-base hover:text-[#f97316] transition-colors">{run.name}</Link>
                        <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                      </div>
                      <div className="text-[#6b7280] text-xs mt-0.5">{format(new Date(run.start_date), 'EEE, MMM d yyyy')} · {(run.distance/1000).toFixed(1)} km · {formatDuration(run.moving_time)}</div>
                    </div>
                    {estimate ? (
                      <div className="text-right shrink-0">
                        <div className="stat-num text-xl font-bold text-[#f97316]">{estimate.estimatedTime}</div>
                        <div className="text-[#6b7280] text-xs">est. 5K</div>
                      </div>
                    ) : <div className="text-[#4b5563] text-xs pt-1">No hard efforts detected</div>}
                  </div>
                  {estimate && <WorkRestStats est={estimate} />}
                  {estimate && <RepTable efforts={estimate.allEfforts} correctionFactor={estimate.correctionFactor} />}
                  {!estimate && (
                    <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">
                      {(run.laps ?? []).length === 0 ? 'No lap data — use "Sync lap data" on the runs page.' : 'No hard efforts detected in lap data.'}
                    </div>
                  )}
                </div>
              )
            })}
            </CollapsibleRuns>
          </div>

          {/* ── COL 2: Threshold ── */}
          <div className="flex flex-col gap-4">
            <div className="card fade-up">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Threshold</h2>
                <span className="text-xs text-[#4b5563]">{thresholdEstimates.length} sessions</span>
              </div>
              <p className="text-[#4b5563] text-xs mb-5">Daniels ratio + HR intensity adjustment</p>
              <FiveKTrendChart estimates={thresholdEstimates} targetSecs={TARGET_SECS} color="#60a5fa" />
            </div>
            {thresholdEstimates.length === 0 && (
              <div className="card text-center py-10 text-[#6b7280] text-sm">
                Tag runs as "Threshold" on the <Link href="/runs" className="text-blue-400 hover:underline">Runs page</Link>.
              </div>
            )}
            <CollapsibleRuns count={(thresholdRuns ?? []).length} color="#60a5fa">
            {(thresholdRuns ?? []).map((run: any) => {
              const estimate = thresholdEstimates.find(e => e.activityId === run.id)
              return (
                <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}` }>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link href={`/runs/${run.id}`} className="font-display font-bold text-base hover:text-blue-400 transition-colors">{run.name}</Link>
                        <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} />
                      </div>
                      <div className="text-[#6b7280] text-xs mt-0.5">{format(new Date(run.start_date), 'EEE, MMM d yyyy')} · {(run.distance/1000).toFixed(1)} km · {formatDuration(run.moving_time)}</div>
                    </div>
                    {estimate ? (
                      <div className="text-right shrink-0">
                        <div className="stat-num text-xl font-bold text-blue-400">{estimate.estimatedTime}</div>
                        <div className="text-[#6b7280] text-xs">est. 5K</div>
                      </div>
                    ) : <div className="text-[#4b5563] text-xs pt-1">Could not estimate</div>}
                  </div>
                  {estimate && <WorkRestStats est={estimate} isThreshold />}
                  {estimate && !estimate.isContinuous && <RepTable efforts={estimate.allEfforts} correctionFactor={estimate.correctionFactor} />}
                  {estimate && estimate.isContinuous && <ContinuousRunTable run={run} />}
                  {!estimate && (
                    <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">
                      {(run.laps ?? run.splits ?? []).length === 0 ? 'No lap data — use "Sync lap data" on the runs page.' : 'Could not estimate — pace may be outside expected range.'}
                    </div>
                  )}
                </div>
              )
            })}
            </CollapsibleRuns>
          </div>

          {/* ── COL 3: Easy runs — aerobic efficiency ── */}
          <div className="flex flex-col gap-4">
            <div className="card fade-up">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">Aerobic Efficiency</h2>
                <span className="text-xs text-[#4b5563]">{easyEstimates.length} runs</span>
              </div>
              <p className="text-[#4b5563] text-xs mb-5">Pace normalised to 150 bpm · downward trend = getting fitter</p>
              <AerobicEfficiencyChart runs={easyEstimates} />
            </div>
            {easyEstimates.length === 0 && (
              <div className="card text-center py-10 text-[#6b7280] text-sm">
                Tag runs as Easy, Easy + Strides, or Long Run — Easy on the{' '}
                <Link href="/runs" className="text-purple-400 hover:underline">Runs page</Link>.
              </div>
            )}
            <CollapsibleRuns count={easyRunResults.filter(({ result }) => result?.excludedReason !== 'Treadmill run — no GPS pace data').length} color="#a78bfa">
            {easyRunResults.filter(({ result }) => result?.excludedReason !== 'Treadmill run — no GPS pace data').map(({ run, result: eff }) => {
              return (
                <div key={run.id} className={`card fade-up ${run.excluded_from_analysis ? 'opacity-40' : ''}`}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link href={`/runs/${run.id}`} className="font-display font-bold text-base hover:text-purple-400 transition-colors">{run.name}</Link>
                        <ToggleAnalysisButton activityId={run.id} excluded={!!run.excluded_from_analysis} autoExcludedReason={eff?.excludedReason} />
                      </div>
                      <div className="text-[#6b7280] text-xs mt-0.5">
                        {format(new Date(run.start_date), 'EEE, MMM d yyyy')} · {(run.distance/1000).toFixed(1)} km · {formatDuration(run.moving_time)}
                        {run.run_type && <span className="ml-2 text-purple-400 capitalize">{run.run_type.replace(/_/g, ' ')}</span>}
                      </div>
                    </div>
                    {eff && !eff.excludedReason ? (
                      <div className="text-right shrink-0">
                        <div className="stat-num text-xl font-bold text-purple-400">{formatPace(eff.normalizedPaceSec)}/km</div>
                        <div className="text-[#6b7280] text-xs">@ 150 bpm</div>
                      </div>
                    ) : null}
                  </div>

                  {eff && !eff.excludedReason && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      <div className="bg-[#111] rounded-lg px-3 py-2">
                        <div className="text-[#4b5563] mb-0.5">Actual</div>
                        <div className="font-mono text-white font-bold">{formatPace(eff.avgPaceSecPerKm)}/km</div>
                        <div className="text-[#4b5563] mt-0.5">avg {Math.round(eff.avgHR)} bpm</div>
                      </div>
                      <div className="bg-[#111] rounded-lg px-3 py-2">
                        <div className="text-[#4b5563] mb-0.5">HR adjustment</div>
                        <div className={`font-mono font-bold ${eff.avgHR > 150 ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {eff.avgHR > 150 ? '▼ ' : '▲ '}{Math.abs((eff.avgPaceSecPerKm - eff.normalizedPaceSec)).toFixed(1)}s/km
                        </div>
                        <div className="text-[#4b5563] mt-0.5">{eff.avgHR > 150 ? 'faster at ref HR' : 'slower at ref HR'}</div>
                      </div>
                      <div className="bg-[#111] rounded-lg px-3 py-2">
                        <div className="text-[#4b5563] mb-0.5">Slope source</div>
                        <div className="font-mono text-purple-400 font-bold">{eff.r2 > 0 ? 'regression' : 'fixed'}</div>
                        <div className="text-[#4b5563] mt-0.5">{eff.r2 > 0 ? `R²=${eff.r2.toFixed(2)}` : '−2.0 s/km·bpm'}</div>
                      </div>
                    </div>
                  )}

                  {eff?.excludedReason && (
                    <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">
                      {eff.excludedReason}
                    </div>
                  )}
                  {!eff && (
                    <div className="text-[#4b5563] text-xs bg-[#111] rounded-lg px-3 py-2">
                      No split data — use "Sync lap data" on the runs page.
                    </div>
                  )}
                </div>
              )
            })}
            </CollapsibleRuns>
          </div>

        </div>
      </main>
    </>
  )
}
