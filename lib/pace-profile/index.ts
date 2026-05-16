import { type PaceZones } from '@/lib/run-classification'

type ObservationKind = 'whole' | 'steady' | 'sustained' | 'fast_rep'
type SegmentSource = 'split' | 'lap'
type HrReliability = 'known' | 'estimated' | 'missing'
type HrIntensity = 'low' | 'aerobic' | 'moderate' | 'hard' | 'very_hard' | 'unknown'
type AnchorName = 'easy' | 'tempo' | 'threshold' | 'interval'

interface SegmentLike {
  average_speed?: number | null
  moving_time?: number | null
  elapsed_time?: number | null
  distance?: number | null
  average_heartrate?: number | null
}

export interface PaceProfileActivity {
  id?: number
  name?: string | null
  type?: string | null
  sport_type?: string | null
  start_date: string
  distance?: number | null
  moving_time?: number | null
  average_speed?: number | null
  average_heartrate?: number | null
  total_elevation_gain?: number | null
  run_type?: string | null
  run_type_manual?: boolean | null
  is_race?: boolean | null
  excluded_from_analysis?: boolean | null
  laps?: SegmentLike[] | null
  splits?: SegmentLike[] | null
  raw?: { trainer?: boolean | null; sport_type?: string | null } | null
}

interface Segment {
  pace: number
  duration: number
  hr?: number
  distance?: number
  source: SegmentSource
  index: number
}

interface Observation {
  kind: ObservationKind
  activityId?: number
  activityDate: string
  pace: number
  duration: number
  weight: number
  hr?: number
  hrFraction?: number
  hrIntensity: HrIntensity
  hrReliability: HrReliability
  paceCv?: number
  runPaceCv: number
  fastestVsMedian: number
  structuredFastRun: boolean
  source: SegmentSource | 'activity'
  sourceQuality: number
  activityWeightCap: number
  elevationPenalty: number
  usedFor: AnchorName[]
}

export interface PaceProfileBuildResult {
  zones: PaceZones | null
  observations: Observation[]
}

interface HrContext {
  reliability: HrReliability
  effectiveMaxHr?: number
  estimatedMaxHr?: number
}

interface LongRunThreshold {
  thresholdKm: number
  medianWeeklyLongestRunKm?: number
  p75RunDistanceKm?: number
  reason: string
}

const MS_PER_DAY = 86400000
const LOOKBACK_DAYS = 90
const RECENCY_HALF_LIFE_DAYS = 28
const MIN_PACE = 150
const MAX_PACE = 720
const KIND_WEIGHT_CAPS: Record<ObservationKind, number> = {
  whole: 1,
  steady: 2,
  sustained: 3,
  fast_rep: 2.5,
}
const EASY_DERIVED_RATIOS = {
  easyMax: 1.08,
  tempoAnchor: 0.86,
  tempoMax: 0.90,
  thresholdAnchor: 0.79,
  thresholdMax: 0.82,
  intervalAnchor: 0.74,
  intervalMax: 0.78,
} as const

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function segmentDuration(segment: SegmentLike) {
  return segment.moving_time ?? segment.elapsed_time ?? 0
}

function segmentPace(segment: SegmentLike) {
  if (segment.average_speed && segment.average_speed > 0) return 1000 / segment.average_speed
  if (segment.distance && segment.distance > 0) {
    const duration = segmentDuration(segment)
    if (duration > 0) return duration / (segment.distance / 1000)
  }
  return null
}

function isValidPace(pace: number | null | undefined) {
  return typeof pace === 'number' && Number.isFinite(pace) && pace >= MIN_PACE && pace <= MAX_PACE
}

function weightedPercentile(items: { value: number; weight: number }[], pct: number) {
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return sorted[Math.floor(sorted.length * pct)]?.value ?? sorted[sorted.length - 1].value
  const target = total * pct
  let cumulative = 0
  for (const item of sorted) {
    cumulative += item.weight
    if (cumulative >= target) return item.value
  }
  return sorted[sorted.length - 1].value
}

function weightedMedian(items: { value: number; weight: number }[]) {
  return weightedPercentile(items, 0.5)
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function percentile(values: number[], pct: number) {
  return weightedPercentile(values.map(value => ({ value, weight: 1 })), pct)
}

function paceCv(paces: number[]) {
  if (paces.length < 3) return 0
  const mean = paces.reduce((sum, pace) => sum + pace, 0) / paces.length
  if (mean <= 0) return 0
  const variance = paces.reduce((sum, pace) => sum + (pace - mean) ** 2, 0) / paces.length
  return Math.sqrt(variance) / mean
}

function durationWeightedPace(segments: { pace: number; duration: number }[]) {
  const total = segments.reduce((sum, segment) => sum + segment.duration, 0)
  return total > 0
    ? segments.reduce((sum, segment) => sum + segment.pace * segment.duration, 0) / total
    : null
}

function durationWeightedHr(segments: { hr?: number; duration: number }[]) {
  const withHr = segments.filter(segment => segment.hr && segment.hr > 60 && segment.hr < 230)
  const total = withHr.reduce((sum, segment) => sum + segment.duration, 0)
  return total > 0
    ? withHr.reduce((sum, segment) => sum + (segment.hr ?? 0) * segment.duration, 0) / total
    : undefined
}

function buildSegments(segments: SegmentLike[] | null | undefined, source: SegmentSource): Segment[] {
  return (segments ?? []).flatMap((segment, index) => {
    const pace = segmentPace(segment)
    const duration = segmentDuration(segment)
    if (!isValidPace(pace) || duration <= 0) return []
    return [{
      pace: pace!,
      duration,
      hr: segment.average_heartrate ?? undefined,
      distance: segment.distance ?? undefined,
      source,
      index,
    }]
  })
}

function looksUserLapped(laps: Segment[]) {
  if (laps.length < 3) return false
  const hasNonKmLap = laps.some(lap => lap.distance && Math.abs(lap.distance - 1000) > 200)
  const durations = laps.map(lap => lap.duration)
  const durationCv = paceCv(durations)
  return hasNonKmLap || durationCv > 0.25
}

function activityEligible(activity: PaceProfileActivity) {
  const activityType = activity.type ?? activity.sport_type ?? activity.raw?.sport_type
  if (activityType && activityType !== 'Run') return false
  if (activity.is_race || activity.run_type === 'race') return false
  if (activity.run_type === 'treadmill' || activity.raw?.trainer) return false
  if (activity.excluded_from_analysis) return false
  if (!activity.start_date || !Number.isFinite(new Date(activity.start_date).getTime())) return false
  return true
}

function elevationPenalty(activity: PaceProfileActivity) {
  const km = (activity.distance ?? 0) / 1000
  if (km <= 0) return 1
  const metersPerKm = (activity.total_elevation_gain ?? 0) / km
  if (metersPerKm > 40) return 0.5
  if (metersPerKm > 20) return 0.75
  return 1
}

function determineHrContext(activities: PaceProfileActivity[], maxHr?: number): HrContext {
  if (maxHr && Number.isFinite(maxHr) && maxHr >= 150 && maxHr <= 230) {
    return { reliability: 'known', effectiveMaxHr: maxHr }
  }

  const hrs: number[] = []
  for (const activity of activities) {
    if (activity.average_heartrate && activity.average_heartrate >= 70 && activity.average_heartrate <= 230) {
      hrs.push(activity.average_heartrate)
    }
    for (const segment of [...buildSegments(activity.splits, 'split'), ...buildSegments(activity.laps, 'lap')]) {
      if (segment.hr && segment.hr >= 70 && segment.hr <= 230) hrs.push(segment.hr)
    }
  }

  const maxObserved = hrs.length ? Math.max(...hrs) : 0
  if (maxObserved >= 140) {
    const estimatedMaxHr = clamp(maxObserved / 0.92, 175, 210)
    return { reliability: 'estimated', effectiveMaxHr: estimatedMaxHr, estimatedMaxHr }
  }

  return { reliability: 'missing' }
}

function hrIntensity(hr: number | undefined, context: HrContext): { fraction?: number; intensity: HrIntensity } {
  if (!hr || !context.effectiveMaxHr) return { intensity: 'unknown' }
  const fraction = hr / context.effectiveMaxHr
  if (fraction < 0.65) return { fraction, intensity: 'low' }
  if (fraction < 0.78) return { fraction, intensity: 'aerobic' }
  if (fraction < 0.88) return { fraction, intensity: 'moderate' }
  if (fraction < 0.94) return { fraction, intensity: 'hard' }
  return { fraction, intensity: 'very_hard' }
}

function activityMetrics(splitSegments: Segment[], fallbackSegments: Segment[]) {
  const segments = splitSegments.length >= 3 ? splitSegments : fallbackSegments
  const paces = segments.map(segment => segment.pace)
  const cv = paceCv(paces)
  const med = median(paces)
  const fastest = paces.length ? Math.min(...paces) : null
  const fastestVsMedian = med && fastest ? fastest / med : 1
  return { cv, fastestVsMedian, medianPace: med }
}

function structuredFastRun(segments: Segment[], medianPace: number | null) {
  if (!medianPace) return false
  const fastCount = segments.filter(segment => segment.duration >= 45 && segment.pace <= medianPace * 0.88).length
  const recoveryCount = segments.filter(segment => segment.duration >= 30 && segment.pace >= medianPace * 1.08).length
  return fastCount >= 2 || paceCv(segments.map(segment => segment.pace)) > 0.14 || (fastCount >= 1 && recoveryCount >= 1)
}

function baseObservationWeight(
  kind: ObservationKind,
  activity: PaceProfileActivity,
  ageDays: number,
  noisy: boolean,
  sourceQuality: number,
) {
  const base = kind === 'whole' ? 1 : kind === 'steady' ? 2 : kind === 'sustained' ? 2.5 : 1.5
  const recencyWeight = 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS)
  const noisyPenalty = noisy ? 0.5 : 1
  return base * recencyWeight * sourceQuality * elevationPenalty(activity) * noisyPenalty
}

function pushObservation(
  observations: Observation[],
  activity: PaceProfileActivity,
  context: HrContext,
  kind: ObservationKind,
  pace: number,
  duration: number,
  weight: number,
  metrics: ReturnType<typeof activityMetrics>,
  structured: boolean,
  source: Observation['source'],
  sourceQuality: number,
  hr?: number,
  paceCvValue?: number,
) {
  if (!isValidPace(pace) || weight <= 0) return
  const hrMeta = hrIntensity(hr, context)
  observations.push({
    kind,
    activityId: activity.id,
    activityDate: activity.start_date,
    pace,
    duration,
    weight,
    hr,
    hrFraction: hrMeta.fraction,
    hrIntensity: hrMeta.intensity,
    hrReliability: context.reliability,
    paceCv: paceCvValue,
    runPaceCv: metrics.cv,
    fastestVsMedian: metrics.fastestVsMedian,
    structuredFastRun: structured,
    source,
    sourceQuality,
    activityWeightCap: KIND_WEIGHT_CAPS[kind],
    elevationPenalty: elevationPenalty(activity),
    usedFor: [],
  })
}

function capObservationWeights(observations: Observation[]) {
  for (const kind of Object.keys(KIND_WEIGHT_CAPS) as ObservationKind[]) {
    const group = observations.filter(observation => observation.kind === kind)
    const total = group.reduce((sum, observation) => sum + observation.weight, 0)
    const cap = KIND_WEIGHT_CAPS[kind]
    if (total > cap) {
      const multiplier = cap / total
      for (const observation of group) observation.weight *= multiplier
    }
  }
}

function trailingWindow(segments: Segment[], minSecs: number) {
  const window: Segment[] = []
  let duration = 0
  for (let i = segments.length - 1; i >= 0 && duration < minSecs; i--) {
    window.unshift(segments[i])
    duration += segments[i].duration
  }
  if (duration < minSecs || window.length === 0) return null
  const pace = durationWeightedPace(window)
  if (!pace) return null
  return {
    pace,
    duration,
    hr: durationWeightedHr(window),
    cv: paceCv(window.map(segment => segment.pace)),
    source: window[0].source,
  }
}

function sustainedWindows(segments: Segment[], activity: PaceProfileActivity) {
  const candidates: { start: number; end: number; duration: number; pace: number; hr?: number; cv: number; score: number }[] = []
  for (let start = 0; start < segments.length; start++) {
    let duration = 0
    const block: Segment[] = []
    for (let end = start; end < segments.length; end++) {
      duration += segments[end].duration
      if (duration > 30 * 60) break
      block.push(segments[end])
      if (duration < 8 * 60) continue
      const cv = paceCv(block.map(segment => segment.pace))
      if (cv > 0.08) continue
      const pace = durationWeightedPace(block)
      if (!pace) continue
      candidates.push({
        start,
        end,
        duration,
        pace,
        hr: durationWeightedHr(block),
        cv,
        score: duration / 60 - cv * 100 - Math.max(0, (activity.total_elevation_gain ?? 0) / Math.max(1, (activity.distance ?? 1) / 1000) - 20) * 0.2,
      })
    }
  }

  const selected: typeof candidates = []
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (selected.length >= 3) break
    const overlaps = selected.some(existing => candidate.start <= existing.end && candidate.end >= existing.start)
    if (!overlaps) selected.push(candidate)
  }
  return selected
}

function buildObservations(activities: PaceProfileActivity[], now: Date, context: HrContext) {
  const observations: Observation[] = []
  const cutoffMs = now.getTime() - LOOKBACK_DAYS * MS_PER_DAY

  for (const activity of activities) {
    const dateMs = new Date(activity.start_date).getTime()
    if (!activityEligible(activity) || dateMs < cutoffMs) continue

    const distanceKm = (activity.distance ?? 0) / 1000
    const movingTime = activity.moving_time ?? 0
    const averagePace = activity.average_speed ? 1000 / activity.average_speed : null
    const splitSegments = buildSegments(activity.splits, 'split')
    const lapSegments = buildSegments(activity.laps, 'lap')
    const workoutSegments = looksUserLapped(lapSegments) ? lapSegments : (lapSegments.length ? lapSegments : splitSegments)
    const metrics = activityMetrics(splitSegments, lapSegments.length ? lapSegments : splitSegments)
    const noisy = metrics.cv > 0.18 || metrics.fastestVsMedian < 0.65
    const structured = structuredFastRun(workoutSegments, metrics.medianPace)
    const ageDays = Math.max(0, (now.getTime() - dateMs) / MS_PER_DAY)
    const raw: Observation[] = []

    if (distanceKm >= 2 && movingTime >= 10 * 60 && isValidPace(averagePace)) {
      pushObservation(
        raw,
        activity,
        context,
        'whole',
        averagePace!,
        movingTime,
        baseObservationWeight('whole', activity, ageDays, noisy, 0.75),
        metrics,
        structured,
        'activity',
        0.75,
        activity.average_heartrate ?? undefined,
      )
    }

    const steady = trailingWindow(splitSegments.length ? splitSegments : lapSegments, 15 * 60)
    if (steady && isValidPace(steady.pace)) {
      pushObservation(
        raw,
        activity,
        context,
        'steady',
        steady.pace,
        steady.duration,
        baseObservationWeight('steady', activity, ageDays, noisy || steady.cv > 0.10, steady.source === 'split' ? 1 : 0.85),
        metrics,
        structured,
        steady.source,
        steady.source === 'split' ? 1 : 0.85,
        steady.hr,
        steady.cv,
      )
    }

    for (const block of sustainedWindows(splitSegments.length ? splitSegments : lapSegments, activity)) {
      pushObservation(
        raw,
        activity,
        context,
        'sustained',
        block.pace,
        block.duration,
        baseObservationWeight('sustained', activity, ageDays, noisy, splitSegments.length ? 1 : 0.85),
        metrics,
        structured,
        splitSegments.length ? 'split' : 'lap',
        splitSegments.length ? 1 : 0.85,
        block.hr,
        block.cv,
      )
    }

    for (const segment of workoutSegments) {
      if (segment.duration < 45 || segment.duration > 10 * 60) continue
      if (metrics.medianPace && segment.pace > metrics.medianPace * 0.96) continue
      pushObservation(
        raw,
        activity,
        context,
        'fast_rep',
        segment.pace,
        segment.duration,
        baseObservationWeight('fast_rep', activity, ageDays, noisy, segment.source === 'lap' ? 1 : 0.8),
        metrics,
        structured,
        segment.source,
        segment.source === 'lap' ? 1 : 0.8,
        segment.hr,
      )
    }

    capObservationWeights(raw)
    observations.push(...raw)
  }

  return observations
}

function weightedItems(observations: Observation[], anchor?: AnchorName) {
  return observations.map(observation => {
    if (anchor && !observation.usedFor.includes(anchor)) observation.usedFor.push(anchor)
    return { value: observation.pace, weight: observation.weight }
  })
}

function uniqueActivityCount(observations: Observation[]) {
  return new Set(observations.map(o => o.activityId ?? `${o.activityDate}-${o.kind}`)).size
}

function hrPurposeWeight(observation: Observation, purpose: AnchorName | 'easyMax') {
  if (observation.hrReliability === 'missing' || observation.hrIntensity === 'unknown') return 0.85
  const estimated = observation.hrReliability === 'estimated'
  const floor = estimated ? 0.2 : 0

  if (!estimated && (purpose === 'easy' || purpose === 'easyMax') && (observation.hrFraction ?? 0) > 0.82) {
    return 0
  }

  const weights: Record<typeof purpose, Partial<Record<HrIntensity, number>>> = {
    easy: { low: 0.45, aerobic: 1.2, moderate: 0.2, hard: 0, very_hard: 0 },
    easyMax: { low: 1, aerobic: 1.15, moderate: 0.35, hard: 0, very_hard: 0 },
    tempo: { low: 0.2, aerobic: 0.45, moderate: 1.2, hard: 0.8, very_hard: 0.35 },
    threshold: { low: 0, aerobic: 0.2, moderate: 0.7, hard: 1.2, very_hard: 0.8 },
    interval: { low: 0.2, aerobic: 0.35, moderate: 0.75, hard: 1.15, very_hard: 1.05 },
  }

  return Math.max(floor, weights[purpose][observation.hrIntensity] ?? 0.85)
}

function withPurposeWeight(observations: Observation[], purpose: AnchorName | 'easyMax') {
  return observations.flatMap(observation => {
    const multiplier = hrPurposeWeight(observation, purpose)
    if (multiplier <= 0) return []
    return [{ ...observation, weight: observation.weight * multiplier }]
  })
}

function enforceMonotonicZones(input: {
  intervalMaxPace: number
  thresholdMaxPace: number
  tempoMaxPace: number
  easyMaxPace: number
}) {
  const intervalMaxPace = input.intervalMaxPace
  const thresholdMaxPace = Math.max(input.thresholdMaxPace, intervalMaxPace * 1.04)
  const tempoMaxPace = Math.max(input.tempoMaxPace, thresholdMaxPace * 1.05)
  const easyMaxPace = Math.max(input.easyMaxPace, tempoMaxPace * 1.10)
  return { intervalMaxPace, thresholdMaxPace, tempoMaxPace, easyMaxPace }
}

function isoWeekKey(d: Date): string {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7)
  return `${utc.getUTCFullYear()}-W${week}`
}

function longRunThreshold(activities: PaceProfileActivity[], now: Date): LongRunThreshold {
  const cutoffMs = now.getTime() - 84 * MS_PER_DAY
  const weeklyMax: Record<string, number> = {}
  const distances: number[] = []
  for (const activity of activities) {
    if (!activityEligible(activity)) continue
    const date = new Date(activity.start_date)
    if (date.getTime() < cutoffMs) continue
    const km = (activity.distance ?? 0) / 1000
    const averagePace = activity.average_speed
      ? 1000 / activity.average_speed
      : activity.moving_time && km > 0
        ? activity.moving_time / km
        : null
    if (km <= 0 || !isValidPace(averagePace)) continue
    distances.push(km)
    const key = isoWeekKey(date)
    if (!weeklyMax[key] || km > weeklyMax[key]) weeklyMax[key] = km
  }
  const weeklyLongest = Object.values(weeklyMax).sort((a, b) => a - b)
  const medianWeeklyLongestRunKm = median(weeklyLongest) ?? undefined
  const p75RunDistanceKm = percentile(distances, 0.75) ?? undefined

  if (weeklyLongest.length < 4) {
    return {
      thresholdKm: 12,
      medianWeeklyLongestRunKm,
      p75RunDistanceKm,
      reason: 'fallback: fewer than 4 usable weekly longest runs',
    }
  }

  const weeklyLongSignal = (medianWeeklyLongestRunKm ?? 0) * 0.90
  const recentDistanceSignal = p75RunDistanceKm ?? 0
  const rawThreshold = Math.max(weeklyLongSignal, recentDistanceSignal)
  const thresholdKm = clamp(rawThreshold, 8, 30)
  const reason = recentDistanceSignal > weeklyLongSignal
    ? 'p75 recent run distance exceeded 90% of weekly long-run median'
    : '90% of weekly long-run median exceeded p75 recent run distance'

  return {
    thresholdKm,
    medianWeeklyLongestRunKm,
    p75RunDistanceKm,
    reason,
  }
}

function roundPace(value: number) {
  return parseFloat(value.toFixed(1))
}

function midpointPercentile(observations: Observation[], low: number, high: number, anchor: AnchorName) {
  const items = weightedItems(observations, anchor)
  const a = weightedPercentile(items, low)
  const b = weightedPercentile(items, high)
  return a && b ? (a + b) / 2 : weightedMedian(items)
}

function nudgeFromEvidence(
  prior: number,
  observed: number | null,
  uniqueEvidenceCount: number,
  maxAdjustmentPct: number,
) {
  if (!observed || uniqueEvidenceCount < 3) return { value: prior, usedEvidence: false }
  const clamped = clamp(observed, prior * (1 - maxAdjustmentPct), prior * (1 + maxAdjustmentPct))
  const evidenceWeight = uniqueEvidenceCount >= 5 ? 0.5 : 0.35
  return {
    value: prior * (1 - evidenceWeight) + clamped * evidenceWeight,
    usedEvidence: true,
  }
}

export function buildTrainingPaceZones(
  activities: PaceProfileActivity[],
  options: { maxHr?: number; now?: Date } = {},
): PaceProfileBuildResult {
  const now = options.now ?? new Date()
  const hrContext = determineHrContext(activities.filter(activityEligible), options.maxHr)
  const observations = buildObservations(activities, now, hrContext)
  const wholeRunObservations = observations.filter(observation => observation.kind === 'whole')
  const derivedAnchors: AnchorName[] = []
  const qualityWarnings: string[] = []

  const structurallyEasy = observations.filter(observation =>
    (observation.kind === 'steady' || (observation.kind === 'whole' && observation.duration >= 20 * 60)) &&
    observation.runPaceCv <= 0.12 &&
    observation.fastestVsMedian >= 0.80,
  )
  const aerobicEasyCandidates = withPurposeWeight(structurallyEasy, 'easy')
    .filter(observation => observation.weight > 0)
  const easyMaxCandidates = withPurposeWeight(structurallyEasy, 'easyMax')
    .filter(observation => observation.weight > 0)

  let easyAnchorPace = aerobicEasyCandidates.length >= 3
    ? midpointPercentile(aerobicEasyCandidates, 0.4, 0.6, 'easy')
    : null
  const observedEasyMaxPace = easyMaxCandidates.length >= 3
    ? weightedPercentile(weightedItems(easyMaxCandidates, 'easy'), 0.80)
    : null
  let easyMaxPace = observedEasyMaxPace

  if (!easyAnchorPace || !easyMaxPace) {
    const hardSteady = structurallyEasy
      .filter(o => o.hrIntensity === 'moderate' || o.hrIntensity === 'hard')
    const hardPace = weightedMedian(weightedItems(withPurposeWeight(hardSteady, 'tempo'), 'tempo'))
    if (hardPace && hrContext.reliability !== 'missing') {
      easyAnchorPace = hardPace * (hardSteady.some(o => o.hrIntensity === 'hard') ? 1.18 : 1.12)
      easyMaxPace = easyAnchorPace * EASY_DERIVED_RATIOS.easyMax
      derivedAnchors.push('easy')
      qualityWarnings.push('easy anchor derived from higher-HR steady running')
    } else {
      const allWholeRunPaces = weightedItems(wholeRunObservations, 'easy')
      easyAnchorPace = weightedMedian(allWholeRunPaces)
      easyMaxPace = easyAnchorPace ? easyAnchorPace * EASY_DERIVED_RATIOS.easyMax : null
      derivedAnchors.push('easy')
      qualityWarnings.push('easy anchor derived from whole-run pace distribution')
    }
  }

  if (!easyAnchorPace || !easyMaxPace || wholeRunObservations.length < 3) {
    return { zones: null, observations }
  }

  const easyMaxNudge = nudgeFromEvidence(
    easyAnchorPace * EASY_DERIVED_RATIOS.easyMax,
    observedEasyMaxPace,
    uniqueActivityCount(easyMaxCandidates),
    0.08,
  )
  easyMaxPace = easyMaxNudge.value

  const tempoCandidates = withPurposeWeight(observations.filter(observation =>
    ((observation.kind === 'sustained' && observation.duration >= 15 * 60 && observation.duration <= 45 * 60) ||
      (observation.kind === 'whole' && observation.duration >= 20 * 60 && observation.duration <= 75 * 60)) &&
    observation.runPaceCv <= 0.12 &&
    observation.pace < easyAnchorPace * 0.98 &&
    observation.pace > easyAnchorPace * 0.74,
  ), 'tempo').filter(observation => observation.weight > 0)

  const tempoEvidenceCount = uniqueActivityCount(tempoCandidates)
  const observedTempoAnchor = weightedMedian(weightedItems(tempoCandidates, 'tempo'))
  const observedTempoMax = weightedPercentile(weightedItems(tempoCandidates, 'tempo'), 0.65)
  const tempoAnchorNudge = nudgeFromEvidence(
    easyAnchorPace * EASY_DERIVED_RATIOS.tempoAnchor,
    observedTempoAnchor,
    tempoEvidenceCount,
    0.08,
  )
  const tempoMaxNudge = nudgeFromEvidence(
    easyAnchorPace * EASY_DERIVED_RATIOS.tempoMax,
    observedTempoMax,
    tempoEvidenceCount,
    0.08,
  )
  const tempoDerived = !tempoAnchorNudge.usedEvidence || !tempoMaxNudge.usedEvidence
  const tempoAnchorPace = tempoAnchorNudge.value
  const tempoMaxPace = tempoMaxNudge.value
  if (tempoDerived) derivedAnchors.push('tempo')

  const thresholdCandidates = withPurposeWeight(observations.filter(observation =>
    ((observation.kind === 'sustained' && observation.duration >= 8 * 60 && observation.duration <= 30 * 60) ||
      (observation.kind === 'fast_rep' && observation.duration >= 3 * 60)) &&
    observation.pace < tempoMaxPace &&
    (observation.paceCv ?? observation.runPaceCv) <= 0.08,
  ), 'threshold').filter(observation => observation.weight > 0)

  const thresholdEvidenceCount = uniqueActivityCount(thresholdCandidates)
  const observedThresholdAnchor = weightedPercentile(weightedItems(thresholdCandidates, 'threshold'), 0.35)
  const observedThresholdMax = weightedPercentile(weightedItems(thresholdCandidates, 'threshold'), 0.70)
  const thresholdAnchorNudge = nudgeFromEvidence(
    easyAnchorPace * EASY_DERIVED_RATIOS.thresholdAnchor,
    observedThresholdAnchor,
    thresholdEvidenceCount,
    0.08,
  )
  const thresholdMaxNudge = nudgeFromEvidence(
    easyAnchorPace * EASY_DERIVED_RATIOS.thresholdMax,
    observedThresholdMax,
    thresholdEvidenceCount,
    0.08,
  )
  const thresholdDerived = !thresholdAnchorNudge.usedEvidence || !thresholdMaxNudge.usedEvidence
  const thresholdAnchorPace = thresholdAnchorNudge.value
  const thresholdMaxPace = thresholdMaxNudge.value
  if (thresholdDerived) derivedAnchors.push('threshold')

  const intervalCandidates = withPurposeWeight(observations.filter(observation =>
    observation.kind === 'fast_rep' &&
    observation.duration >= 45 &&
    observation.duration <= 10 * 60 &&
    observation.pace < thresholdMaxPace &&
    observation.structuredFastRun,
  ), 'interval').filter(observation => observation.weight > 0)

  const intervalEvidenceCount = uniqueActivityCount(intervalCandidates)
  const observedIntervalAnchor = weightedPercentile(weightedItems(intervalCandidates, 'interval'), 0.40)
  const observedIntervalMax = weightedPercentile(weightedItems(intervalCandidates, 'interval'), 0.75)
  const intervalAnchorNudge = nudgeFromEvidence(
    easyAnchorPace * EASY_DERIVED_RATIOS.intervalAnchor,
    observedIntervalAnchor,
    intervalEvidenceCount,
    0.10,
  )
  const intervalMaxNudge = nudgeFromEvidence(
    easyAnchorPace * EASY_DERIVED_RATIOS.intervalMax,
    observedIntervalMax,
    intervalEvidenceCount,
    0.10,
  )
  const intervalDerived = !intervalAnchorNudge.usedEvidence || !intervalMaxNudge.usedEvidence
  const intervalAnchorPace = intervalAnchorNudge.value
  const intervalMaxPace = intervalMaxNudge.value
  if (intervalDerived) derivedAnchors.push('interval')

  const zones = enforceMonotonicZones({
    intervalMaxPace,
    thresholdMaxPace,
    tempoMaxPace,
    easyMaxPace,
  })

  const easyActivityCount = uniqueActivityCount(aerobicEasyCandidates)
  const hardActivityCount = uniqueActivityCount([...tempoCandidates, ...thresholdCandidates, ...intervalCandidates])
  const uniqueActivities = uniqueActivityCount(observations)
  const historyDays = observations.length
    ? (now.getTime() - Math.min(...observations.map(o => new Date(o.activityDate).getTime()))) / MS_PER_DAY
    : 0
  const confidence: PaceZones['confidence'] =
    easyActivityCount >= 8 && hardActivityCount >= 3 && historyDays >= 21 && derivedAnchors.length === 0 && hrContext.reliability !== 'missing'
      ? 'high'
      : uniqueActivities >= 5 && easyActivityCount >= 3
        ? 'medium'
        : 'low'

  if (hrContext.reliability === 'missing') qualityWarnings.push('heart-rate unavailable; anchors are pace-structure based')
  if (derivedAnchors.length > 0) qualityWarnings.push(`derived anchors: ${Array.from(new Set(derivedAnchors)).join(', ')}`)

  const reason = confidence === 'high'
    ? 'training-derived from HR-consistent recent easy and hard observations'
    : confidence === 'medium'
      ? 'training-derived with partial HR or ratio-derived boundaries'
      : 'limited or uneven training data; several boundaries are derived'
  const longRun = longRunThreshold(activities, now)

  return {
    zones: {
      intervalMaxPace: roundPace(zones.intervalMaxPace),
      thresholdMaxPace: roundPace(zones.thresholdMaxPace),
      tempoMaxPace: roundPace(zones.tempoMaxPace),
      easyMaxPace: roundPace(zones.easyMaxPace),
      longRunThresholdKm: parseFloat(longRun.thresholdKm.toFixed(1)),
      source: 'training',
      confidence,
      sampleSize: observations.length,
      easySampleSize: aerobicEasyCandidates.length,
      tempoSampleSize: tempoCandidates.length,
      thresholdSampleSize: thresholdCandidates.length,
      intervalSampleSize: intervalCandidates.length,
      generatedAt: now.toISOString(),
      reason,
      easyAnchorPace: roundPace(easyAnchorPace),
      tempoAnchorPace: roundPace(tempoAnchorPace),
      thresholdAnchorPace: roundPace(thresholdAnchorPace),
      intervalAnchorPace: roundPace(intervalAnchorPace),
      hrReliability: hrContext.reliability,
      effectiveMaxHr: hrContext.effectiveMaxHr ? Math.round(hrContext.effectiveMaxHr) : undefined,
      estimatedMaxHr: hrContext.estimatedMaxHr ? Math.round(hrContext.estimatedMaxHr) : undefined,
      easyActivityCount,
      hardActivityCount,
      uniqueActivityCount: uniqueActivities,
      medianWeeklyLongestRunKm: longRun.medianWeeklyLongestRunKm !== undefined
        ? parseFloat(longRun.medianWeeklyLongestRunKm.toFixed(1))
        : undefined,
      p75RunDistanceKm: longRun.p75RunDistanceKm !== undefined
        ? parseFloat(longRun.p75RunDistanceKm.toFixed(1))
        : undefined,
      longRunThresholdReason: longRun.reason,
      derivedAnchors: Array.from(new Set(derivedAnchors)),
      qualityWarnings,
    },
    observations,
  }
}
