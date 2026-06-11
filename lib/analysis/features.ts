import { supabaseAdmin } from '../supabase'
import { analyzeEasyRun } from './easyRuns'

/**
 * Feature extractors for the new race projector.
 *
 * Each extractor consumes a flat list of runs and returns a small structured
 * summary. There is no per-run-type bucketing — every run gets passed to every
 * extractor, and each extractor self-filters via its own qualification rules.
 *
 * The orchestrator `loadAthleteFeatures` does the single DB read.
 */

export interface AerobicTrendPoint {
  date: string
  activityId: number
  paceAt150SecPerKm: number   // normalized pace at HR=150
  durationMins: number
  avgHR: number
  rawPaceSecPerKm: number
}

export interface AerobicFeature {
  points: AerobicTrendPoint[]
  /** Recency- and duration-weighted average of recent normalized paces (sec/km). */
  currentPaceSecPerKm: number | null
  /** Linear regression slope: positive = pace getting slower (regression). */
  trendSecPerKmPerWeek: number | null
}

export interface EnduranceFeature {
  longestRunKm: number
  longestRunDate: string | null
  weeklyVolumeKm: number
  weeklyDurationMins: number
  runsInWindow: number
}

export type FormStatus = 'detrained' | 'fresh' | 'neutral' | 'building' | 'fatigued'

export interface FormFeature {
  /** 7-day load total (suffer_score-equivalent units). */
  acuteLoad: number
  /** 28-day load total. */
  chronicLoad: number
  /** Acute-daily-avg / chronic-daily-avg. 1.0 = consistent training. */
  acuteChronicRatio: number
  status: FormStatus
}

export interface DriftFeature {
  /** Average raw cardiac drift % across qualifying runs in window. */
  avgDriftPct: number | null
  /** Average drift in excess of normal aerobic decay. Positive = fading. */
  avgExcessDriftPct: number | null
  sampleSize: number
}

export interface AthleteFeatures {
  aerobic: AerobicFeature
  endurance: EnduranceFeature
  form: FormFeature
  drift: DriftFeature
  windowDays: number
}

interface RunRow {
  id: number
  start_date: string
  distance: number
  moving_time: number
  average_speed: number | null
  average_heartrate: number | null
  suffer_score: number | null
  splits: any[] | null
  laps: any[] | null
  run_type: string | null
  raw: any
  excluded_from_analysis: boolean | null
}

export function extractAerobic(runs: RunRow[]): AerobicFeature {
  const points: AerobicTrendPoint[] = []
  for (const run of runs) {
    if (run.excluded_from_analysis) continue
    const eff = analyzeEasyRun({
      id: run.id,
      name: '',
      start_date: run.start_date,
      run_type: run.run_type ?? undefined,
      distance: run.distance,
      moving_time: run.moving_time,
      average_speed: run.average_speed ?? 0,
      average_heartrate: run.average_heartrate ?? undefined,
      splits: run.splits ?? [],
      laps: run.laps ?? [],
      raw: run.raw,
    })
    if (!eff || (eff as any).excludedReason) continue
    points.push({
      date: eff.date,
      activityId: run.id,
      paceAt150SecPerKm: eff.normalizedPaceSec,
      durationMins: run.moving_time / 60,
      avgHR: eff.avgHR,
      rawPaceSecPerKm: eff.avgPaceSecPerKm,
    })
  }
  points.sort((a, b) => a.date.localeCompare(b.date))

  if (points.length === 0) {
    return { points: [], currentPaceSecPerKm: null, trendSecPerKmPerWeek: null }
  }

  // Recency- and duration-weighted current level over the last 6 points.
  const recent = points.slice(-6)
  const lastMs = new Date(points[points.length - 1].date).getTime()
  const halfLifeDays = 21
  let sumW = 0
  let sumP = 0
  for (const p of recent) {
    const ageDays = (lastMs - new Date(p.date).getTime()) / 86_400_000
    const recencyW = Math.exp(-ageDays * Math.LN2 / halfLifeDays)
    const durationW = Math.log(Math.max(p.durationMins, 5) + 1)
    const w = recencyW * durationW
    sumW += w
    sumP += p.paceAt150SecPerKm * w
  }
  const currentPaceSecPerKm = sumW > 0 ? sumP / sumW : null

  // Linear trend over the full series.
  let trendSecPerKmPerWeek: number | null = null
  if (points.length >= 4) {
    const t0 = new Date(points[0].date).getTime()
    const xs = points.map(p => (new Date(p.date).getTime() - t0) / 86_400_000)
    const ys = points.map(p => p.paceAt150SecPerKm)
    const n = xs.length
    const xMean = xs.reduce((s, x) => s + x, 0) / n
    const yMean = ys.reduce((s, y) => s + y, 0) / n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean)
      den += (xs[i] - xMean) ** 2
    }
    const slopePerDay = den > 0 ? num / den : 0
    trendSecPerKmPerWeek = slopePerDay * 7
  }

  return { points, currentPaceSecPerKm, trendSecPerKmPerWeek }
}

export function extractEndurance(runs: RunRow[], windowDays: number): EnduranceFeature {
  let longestKm = 0
  let longestDate: string | null = null
  let totalKm = 0
  let totalMins = 0
  let count = 0
  for (const r of runs) {
    if (r.excluded_from_analysis) continue
    const km = r.distance / 1000
    if (km > longestKm) {
      longestKm = km
      longestDate = r.start_date
    }
    totalKm += km
    totalMins += r.moving_time / 60
    count++
  }
  const weeks = Math.max(1, windowDays / 7)
  return {
    longestRunKm: longestKm,
    longestRunDate: longestDate,
    weeklyVolumeKm: totalKm / weeks,
    weeklyDurationMins: totalMins / weeks,
    runsInWindow: count,
  }
}

export function extractForm(runs: RunRow[]): FormFeature {
  const now = Date.now()
  const dayMs = 86_400_000
  const acuteDays = 7
  const chronicDays = 28

  // Strava suffer_score is a TRIMP-like proxy. When missing, fall back to a
  // crude duration × intensity estimate.
  const loadFor = (r: RunRow): number => {
    if (typeof r.suffer_score === 'number') return r.suffer_score
    const hr = r.average_heartrate ?? 140
    const intensity = Math.max(0.5, hr / 180)
    return (r.moving_time / 60) * intensity * 2
  }

  let acute = 0
  let chronic = 0
  for (const r of runs) {
    if (r.excluded_from_analysis) continue
    const ageDays = (now - new Date(r.start_date).getTime()) / dayMs
    if (ageDays < 0) continue
    const load = loadFor(r)
    if (ageDays <= acuteDays) acute += load
    if (ageDays <= chronicDays) chronic += load
  }

  // Compare same-units daily averages, so consistent training → ratio ≈ 1.
  const acuteDaily = acute / acuteDays
  const chronicDaily = chronic / chronicDays
  const ratio = chronicDaily > 0 ? acuteDaily / chronicDaily : 0

  const status: FormStatus =
    chronicDaily === 0 ? 'detrained' :
    ratio < 0.6 ? 'detrained' :
    ratio < 0.85 ? 'fresh' :
    ratio < 1.15 ? 'neutral' :
    ratio < 1.4 ? 'building' : 'fatigued'

  return { acuteLoad: acute, chronicLoad: chronic, acuteChronicRatio: ratio, status }
}

/**
 * Drift v1: reuses easyRun analyzer (which already runs computeCardiacDrift on
 * the splits) and averages the reliable readings. Heat-residual normalization
 * is deferred — needs the conditions table joined in.
 */
export function extractDrift(runs: RunRow[]): DriftFeature {
  const drifts: number[] = []
  const excess: number[] = []
  for (const run of runs) {
    if (run.excluded_from_analysis) continue
    const eff = analyzeEasyRun({
      id: run.id,
      name: '',
      start_date: run.start_date,
      run_type: run.run_type ?? undefined,
      distance: run.distance,
      moving_time: run.moving_time,
      average_speed: run.average_speed ?? 0,
      average_heartrate: run.average_heartrate ?? undefined,
      splits: run.splits ?? [],
      laps: run.laps ?? [],
      raw: run.raw,
    }) as any
    if (!eff || eff.excludedReason || !eff.driftReliable) continue
    if (typeof eff.driftRawPct === 'number') drifts.push(eff.driftRawPct)
    if (typeof eff.driftExcessPct === 'number') excess.push(eff.driftExcessPct)
  }
  if (drifts.length === 0) return { avgDriftPct: null, avgExcessDriftPct: null, sampleSize: 0 }
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  return {
    avgDriftPct: avg(drifts),
    avgExcessDriftPct: excess.length > 0 ? avg(excess) : null,
    sampleSize: drifts.length,
  }
}

export async function loadAthleteFeatures(
  athleteId: number,
  windowDays: number = 60,
): Promise<AthleteFeatures> {
  const cutoffISO = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const { data } = await supabaseAdmin
    .from('activities')
    .select('id, start_date, distance, moving_time, average_speed, average_heartrate, suffer_score, splits, laps, run_type, raw, excluded_from_analysis')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .gte('start_date', cutoffISO)
    .order('start_date', { ascending: true })

  const runs = (data ?? []) as RunRow[]

  return {
    aerobic: extractAerobic(runs),
    endurance: extractEndurance(runs, windowDays),
    form: extractForm(runs),
    drift: extractDrift(runs),
    windowDays,
  }
}
