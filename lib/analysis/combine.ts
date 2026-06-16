import { type CombinedEstimate, type DistanceKey, type EstimateSource, type RaceEstimate } from './types'
// ─── Signal combiner ─────────────────────────────────────────────────────────

/** Fixed training source weights per distance.
 *  long_run is intentionally 0: long run steady-state signal flows through easy_trend
 *  (via longRunSteadyEfficiencyPoints), and fast blocks flow through threshold.
 *  Weights redistribution handles the rebalancing automatically. */
const TRAINING_WEIGHTS: Record<DistanceKey, Record<EstimateSource, number>> = {
  '5k':  { interval: 0.75, threshold: 0.20, easy_trend: 0.00, long_run: 0.00, race_result: 0.05 },
  '10k': { interval: 0.40, threshold: 0.40, easy_trend: 0.10, long_run: 0.00, race_result: 0.10 },
  'hm':  { interval: 0.10, threshold: 0.35, easy_trend: 0.45, long_run: 0.00, race_result: 0.10 },
  'fm':  { interval: 0.05, threshold: 0.25, easy_trend: 0.60, long_run: 0.00, race_result: 0.10 },
}

/** Get the fixed weight for a source at a distance */
export function getSourceWeight(distanceKey: DistanceKey, source: EstimateSource): number {
  return TRAINING_WEIGHTS[distanceKey][source]
}

/**
 * Get effective weights after redistributing missing sources' weights.
 * Sources with no data get 0; their weight is redistributed proportionally.
 */
export function getEffectiveWeights(
  distanceKey: DistanceKey,
  availableSources: EstimateSource[]
): Record<EstimateSource, number> {
  const base = TRAINING_WEIGHTS[distanceKey]
  const allSources: EstimateSource[] = ['interval', 'threshold', 'easy_trend', 'long_run', 'race_result']
  const available = new Set(availableSources)
  const totalAvailable = allSources.filter(s => available.has(s)).reduce((sum, s) => sum + base[s], 0)

  const result: Record<EstimateSource, number> = { interval: 0, threshold: 0, easy_trend: 0, long_run: 0, race_result: 0 }
  if (totalAvailable === 0) return result
  for (const s of allSources) {
    result[s] = available.has(s) ? base[s] / totalAvailable : 0
  }
  return result
}

/**
 * Weighted average helper.
 * Each item gets: recencyWeight × speedBonus.
 * - recencyWeight: most recent (index 0) = N, next = N-1, ..., last = 1
 * - speedBonus: faster estimates (lower secs) get up to 1.5× weight.
 *   Slowest in the set = 1.0×, fastest = 1.5×, linear interpolation.
 */
function recencySpeedAvg(items: RaceEstimate[]): number {
  if (items.length === 1) return items[0].estimatedSecs
  const n = items.length
  const fastest = Math.min(...items.map(it => it.estimatedSecs))
  const slowest = Math.max(...items.map(it => it.estimatedSecs))
  const range = slowest - fastest
  let totalW = 0, totalS = 0
  items.forEach((item, i) => {
    const recency = n - i // items[0] is most recent
    const speedBonus = range > 0 ? 1 + 0.5 * (1 - (item.estimatedSecs - fastest) / range) : 1
    const w = recency * speedBonus * (item.weightMultiplier ?? 1)
    totalW += w
    totalS += item.estimatedSecs * w
  })
  return totalS / totalW
}

/**
 * Per-source aggregation: drop slowest + recency/speed weighting.
 * - Interval/Threshold: last 5, drop 1 slowest, weight by recency + speed
 * - Easy trend: last 10, drop 4 slowest, weight by recency + speed
 * - Long run / Race: simple recency + speed weighted average (no dropping)
 */
function aggregateSource(
  items: RaceEstimate[],
  source: EstimateSource
): number | null {
  if (items.length === 0) return null

  // Sort by date descending (most recent first)
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date))

  if (source === 'interval' || source === 'threshold') {
    const recent = sorted.slice(0, 5)
    if (recent.length <= 1) return recent[0].estimatedSecs
    // Drop the slowest (highest estimatedSecs)
    const slowestIdx = recent.reduce((maxI, item, i) =>
      item.estimatedSecs > recent[maxI].estimatedSecs ? i : maxI, 0)
    const kept = recent.filter((_, i) => i !== slowestIdx)
    return recencySpeedAvg(kept)
  }

  if (source === 'easy_trend') {
    const recent = sorted.slice(0, 10)
    if (recent.length <= 4) return recencySpeedAvg(recent)
    // Drop the 4 slowest
    const withIdx = recent.map((item, origIdx) => ({ item, origIdx }))
    withIdx.sort((a, b) => b.item.estimatedSecs - a.item.estimatedSecs)
    const dropIndices = new Set(withIdx.slice(0, 4).map(w => w.origIdx))
    const kept = recent.filter((_, i) => !dropIndices.has(i))
    return recencySpeedAvg(kept)
  }

  // long_run and race_result: recency + speed weighted average
  return recencySpeedAvg(sorted)
}

export function combineEstimates(
  allEstimates: RaceEstimate[],
  distanceKey: DistanceKey,
  runsSinceRace: number = Infinity,
  longestRecentRunKm: number = 0
): CombinedEstimate | null {
  const matching = allEstimates.filter(e => e.distanceKey === distanceKey)
  if (matching.length === 0) return null

  // Group by source
  const bySource: Partial<Record<EstimateSource, RaceEstimate[]>> = {}
  // For race_result, separate direct vs projected
  const directRaceEstimates: RaceEstimate[] = []
  const projectedRaceEstimates: RaceEstimate[] = []

  for (const e of matching) {
    if (e.source === 'race_result') {
      if (e.projected) {
        projectedRaceEstimates.push(e)
      } else {
        directRaceEstimates.push(e)
      }
    }
    if (!bySource[e.source]) bySource[e.source] = []
    bySource[e.source]!.push(e)
  }

  // Step 1: Per-source aggregation with drop-slowest + recency
  // For race_result source, we aggregate projected estimates only (direct race handled via override)
  const sourceAggs: Partial<Record<EstimateSource, number>> = {}
  const allSources: EstimateSource[] = ['interval', 'threshold', 'easy_trend', 'long_run']

  for (const src of allSources) {
    const items = bySource[src]
    if (!items || items.length === 0) continue
    const agg = aggregateSource(items, src)
    if (agg !== null) sourceAggs[src] = agg
  }

  // For race_result in training weights: use projected race estimates only
  if (projectedRaceEstimates.length > 0) {
    const agg = aggregateSource(projectedRaceEstimates, 'race_result')
    if (agg !== null) sourceAggs['race_result'] = agg
  }

  // Step 2: Cross-source blending with fixed weights
  const trainingWeights = TRAINING_WEIGHTS[distanceKey]
  const availableSources = (Object.keys(sourceAggs) as EstimateSource[])

  if (availableSources.length === 0 && directRaceEstimates.length === 0) return null

  // Calculate training estimate (from non-race sources + projected race)
  let trainingEstimate: number | null = null
  if (availableSources.length > 0) {
    // Redistribute weights of missing sources proportionally
    const totalAvailableWeight = availableSources.reduce((s, src) => s + trainingWeights[src], 0)
    if (totalAvailableWeight > 0) {
      let weightedSum = 0
      for (const src of availableSources) {
        const normalizedWeight = trainingWeights[src] / totalAvailableWeight
        weightedSum += sourceAggs[src]! * normalizedWeight
      }
      trainingEstimate = weightedSum
    }
  }

  // Step 3: Race result override (direct race for this exact distance)
  let bestEstimateSecs: number
  const hasDirectRace = directRaceEstimates.length > 0

  if (hasDirectRace && trainingEstimate !== null) {
    // Most recent direct race
    const sortedRaces = [...directRaceEstimates].sort((a, b) => b.date.localeCompare(a.date))
    const directRaceSecs = sortedRaces[0].estimatedSecs

    // raceWeight = max(0.10, 1.0 - runsSinceRace × 0.9 / 100)
    const raceWeight = Math.max(0.10, 1.0 - runsSinceRace * 0.9 / 100)
    bestEstimateSecs = directRaceSecs * raceWeight + trainingEstimate * (1 - raceWeight)
  } else if (hasDirectRace) {
    bestEstimateSecs = directRaceEstimates.sort((a, b) => b.date.localeCompare(a.date))[0].estimatedSecs
  } else {
    bestEstimateSecs = trainingEstimate!
  }

  // Endurance readiness penalty for HM/FM: if the runner's longest recent
  // run is short relative to the target distance, add a time penalty.
  // No penalty once longest run reaches the threshold.
  let endurancePenaltyPct = 0
  if (distanceKey === 'hm' || distanceKey === 'fm') {
    // HM: no penalty at 25km+, up to 8% at 0km
    // FM: no penalty at 35km+, up to 15% at 0km
    const thresholdKm   = distanceKey === 'hm' ? 25 : 35
    const maxPenaltyPct = distanceKey === 'hm' ? 0.08 : 0.15
    if (longestRecentRunKm < thresholdKm) {
      const ratio = Math.min(1, longestRecentRunKm / thresholdKm)
      endurancePenaltyPct = maxPenaltyPct * (1 - ratio)
      bestEstimateSecs = bestEstimateSecs * (1 + endurancePenaltyPct)
    }
  }

  // Confidence based on source count × data depth
  // High requires 3+ sources with good data; medium requires 2+ sources
  const dataPoints = matching.length
  const bestConfidence = Math.max(...matching.map(e => e.confidence))
  const sourceCount = availableSources.length + (hasDirectRace ? 1 : 0)
  // Base from best source, small bonus per additional source, bonus for data depth
  const diversityBonus = Math.min(0.10, (sourceCount - 1) * 0.03)
  const depthBonus = Math.min(0.10, (dataPoints - 1) * 0.01)
  const confidence = Math.min(1, bestConfidence * 0.8 + diversityBonus + depthBonus)

  // Build contributors list with recency weights for display
  const now = Date.now()
  const HALF_LIFE_DAYS = 42
  const contributors = matching
    .map(e => {
      const ageDays = (now - new Date(e.date).getTime()) / 86400000
      const recencyWeight = Math.exp(-ageDays * Math.LN2 / HALF_LIFE_DAYS)
      return {
        source: e.source,
        estimatedSecs: e.estimatedSecs,
        weight: parseFloat((e.confidence * recencyWeight).toFixed(3)),
        date: e.date,
        activityId: e.activityId,
        method: e.method,
      }
    })
    .sort((a, b) => b.weight - a.weight)

  return {
    bestEstimateSecs,
    confidence,
    sourceAverages: sourceAggs,
    effectiveWeights: getEffectiveWeights(distanceKey, availableSources),
    endurancePenaltyPct: endurancePenaltyPct > 0 ? endurancePenaltyPct : undefined,
    longestRecentRunKm: longestRecentRunKm > 0 ? longestRecentRunKm : undefined,
    contributors,
  }
}
