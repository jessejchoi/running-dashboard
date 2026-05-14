import { type FastBlock, type LongRunAnalysis, type LongRunStructure, type RaceEstimate } from './types'
import { formatPace } from './formatting'
import { riegelProject } from './riegel'
import { DEFAULT_MAX_HR, computeCardiacDrift, driftPenaltyMultiplier } from './physiology'
import { type SteadyWindow, type TimedSplit, buildTimedSplits, extractSteadyWindow, wavg } from './steadyWindows'
import { THRESHOLD_CONFIDENCE, THRESHOLD_TO_10K, THRESHOLD_TO_HM, continuousDanielsRatio } from './threshold'
// ─── Long run analyzer ───────────────────────────────────────────────────────

// ─── Fast block detection ─────────────────────────────────────────────────────

const LONG_RUN_MIN_BLOCK_SECS = 8 * 60
// Minimum % faster than the first-30-min baseline to qualify as a fast block.
const FAST_BLOCK_MIN_PCT_FASTER = 5

// Fatigue credit applied to fast block pace estimates.
// A fast block run deep into a long run represents better fitness than the same
// pace fresh. Use block midpoint rather than start time, and give longer blocks
// a small extra bonus because sustained pace under fatigue is more meaningful
// than a short surge.
const FATIGUE_REF_SECS  = 30 * 60
const FATIGUE_CREDIT_K  = 12
const FATIGUE_MIN_START_SECS = 10 * 60
const FATIGUE_DURATION_REF_SECS = 10 * 60
const FATIGUE_DURATION_BONUS_K = 3
const FATIGUE_MAX_CREDIT_SECS = 30

// Weighted average pace of the first ~30 min of timed splits (warm-up baseline).
function getFirst30MinBaseline(timed: TimedSplit[]): number | null {
  const TARGET_SECS = 30 * 60
  const splits: TimedSplit[] = []
  let cumDur = 0
  for (const sp of timed) {
    splits.push(sp)
    cumDur += sp.duration
    if (cumDur >= TARGET_SECS) break
  }
  if (splits.length < 2) return null
  return wavg(splits, 'pace')
}

// Find the fastest user-created lap ≥5 min.
// User-created laps are distinguished from auto km-splits by distance not near 1 km
// (heuristic: dist > 300 m and |dist − 1000| > 200 m).
// Requires ≥2 qualifying laps — a single qualifying lap almost always means
// a whole-run auto-lap, not a deliberate fast-section marker.
function detectUserLapFastBlock(laps: any[]): FastBlock | null {
  const MIN_USER_LAP_SECS = 5 * 60

  // Build lap start times from cumulative elapsed time
  let cumSec = 0
  const lapTimings: { lap: any; startSec: number; endSec: number }[] = []
  for (const lap of laps) {
    const dur = lap.elapsed_time ?? lap.moving_time ?? 0
    lapTimings.push({ lap, startSec: cumSec, endSec: cumSec + dur })
    cumSec += dur
  }

  // Filter: user laps only, ≥5 min, have speed data
  const userLaps = lapTimings.filter(({ lap }) => {
    const dist = lap.distance ?? 0
    const dur  = lap.elapsed_time ?? lap.moving_time ?? 0
    return dist > 300 && Math.abs(dist - 1000) > 200 && dur >= MIN_USER_LAP_SECS && (lap.average_speed ?? 0) > 0
  })
  // Single qualifying lap = whole-run auto-lap, not a real section marker
  if (userLaps.length < 2) return null

  // Pick fastest by average speed
  const fastest = userLaps.reduce((a, b) =>
    (b.lap.average_speed ?? 0) > (a.lap.average_speed ?? 0) ? b : a
  )
  const dur = fastest.lap.elapsed_time ?? fastest.lap.moving_time ?? 0

  return {
    startSec:             fastest.startSec,
    endSec:               fastest.endSec,
    durationSecs:         dur,
    avgPace:              parseFloat((1000 / fastest.lap.average_speed).toFixed(1)),
    avgHR:                parseFloat((fastest.lap.average_heartrate ?? 0).toFixed(1)),
    pctFasterThanBaseline: 0, // filled in by caller after baseline is known
  }
}

// Find the fast block anchored at the peak (fastest) split, then expand outward
// as long as adjacent splits stay within a pace buffer of the peak.
// This correctly handles multiple progressions — it finds the fastest single
// effort and the continuous window where that effort is sustained, rather than
// averaging across two separate hard stretches.
function detectFastestWindowBlock(
  timed: TimedSplit[],
  baselinePace: number,
  minBlockSecs: number,
  minPctFaster: number,
): FastBlock | null {
  if (timed.length < 2) return null

  // Step 1: find the single fastest split
  let peakIdx = 0
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].pace < timed[peakIdx].pace) peakIdx = i
  }
  const peakPace = timed[peakIdx].pace

  // Step 2: include any adjacent split within 8% of peak pace (or 15 s/km, whichever is larger)
  const buffer = Math.max(peakPace * 0.08, 15)
  const cutoff = peakPace + buffer

  let start = peakIdx
  let end   = peakIdx
  while (start > 0 && timed[start - 1].pace <= cutoff) start--
  while (end < timed.length - 1 && timed[end + 1].pace <= cutoff) end++

  const windowSplits = timed.slice(start, end + 1)
  const cumDur = windowSplits.reduce((s, sp) => s + sp.duration, 0)
  if (cumDur < minBlockSecs) return null

  const avgPace   = wavg(windowSplits, 'pace')
  const pctFaster = (baselinePace - avgPace) / baselinePace * 100
  if (pctFaster < minPctFaster) return null

  return {
    startSec:              timed[start].tStart,
    endSec:                timed[end].tEnd,
    durationSecs:          timed[end].tEnd - timed[start].tStart,
    avgPace:               parseFloat(avgPace.toFixed(1)),
    avgHR:                 parseFloat(wavg(windowSplits, 'hr').toFixed(1)),
    pctFasterThanBaseline: parseFloat(pctFaster.toFixed(1)),
  }
}

function fastBlockFatigueCredit(block: FastBlock): number {
  const effectiveMidpoint = Math.max(
    block.startSec + block.durationSecs / 2,
    FATIGUE_MIN_START_SECS
  )
  const depthCredit = FATIGUE_CREDIT_K * Math.log2(effectiveMidpoint / FATIGUE_REF_SECS)
  const durationCredit = FATIGUE_DURATION_BONUS_K * Math.log2(
    Math.max(block.durationSecs, FATIGUE_DURATION_REF_SECS) / FATIGUE_DURATION_REF_SECS
  )
  return Math.max(
    0,
    Math.min(FATIGUE_MAX_CREDIT_SECS, depthCredit + durationCredit)
  )
}

// Treat the fast block like a continuous threshold run — same Daniels ratio
// with a 20% confidence discount (pre-fatigued) but a fatigue credit applied
// to pace: blocks deeper into the run represent higher fitness than the same
// pace run fresh.
function fastBlockThresholdEstimates(
  block: FastBlock,
  activityId: number,
  date: string,
  maxHr: number,
): RaceEstimate[] {
  if (block.durationSecs < LONG_RUN_MIN_BLOCK_SECS) return []
  if (block.avgPace < 180 || block.avgPace > 420) return []

  // Fatigue credit: blocks later in the run get a pace bonus before estimation.
  const fatigueCredit = fastBlockFatigueCredit(block)
  const adjustedPace = block.avgPace - fatigueCredit

  const ratio    = continuousDanielsRatio(block.avgHR, maxHr)
  const fiveKPac = adjustedPace * ratio
  const est5K    = Math.max(840, Math.min(3000, fiveKPac * 5))
  const DISCOUNT = 0.80
  const label    = `Long run fast block (${(block.durationSecs / 60).toFixed(0)} min @ ${formatPace(block.avgPace)}/km, fatigue +${fatigueCredit.toFixed(1)}s credit)`

  return [
    {
      distanceKey: '5k',
      estimatedSecs: est5K,
      confidence: THRESHOLD_CONFIDENCE['5k']  * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} via Daniels ${ratio.toFixed(3)}`,
    },
    {
      distanceKey: '10k',
      estimatedSecs: adjustedPace * THRESHOLD_TO_10K * 10,
      confidence: THRESHOLD_CONFIDENCE['10k'] * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} → 10K via threshold ratio`,
    },
    {
      distanceKey: 'hm',
      estimatedSecs: adjustedPace * THRESHOLD_TO_HM * 21.097,
      confidence: THRESHOLD_CONFIDENCE['hm']  * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} ≈ HM race pace`,
    },
    {
      distanceKey: 'fm',
      estimatedSecs: riegelProject(adjustedPace * THRESHOLD_TO_HM * 21.097, 21.097, 42.195, 1.07),
      confidence: THRESHOLD_CONFIDENCE['fm']  * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} → FM via Riegel`,
    },
  ]
}

// Residual elevation: % HR elevation at easy pace after a fast block recovers.
// Only meaningful for fast_middle — compares the post-recovery easy HR to the
// pre-block easy HR at the same pace (±10%). Tracked separately, not used in
// race time prediction.
function computeResidualElevation(
  timed: TimedSplit[],
  block: FastBlock,
  preFastAvgHR: number,
  preFastAvgPace: number,
  totalSecs: number,
): number | undefined {
  const RECOVERY_SKIP = 10 * 60  // allow 10 min for HR to settle post-block
  const WINDOW_SECS   = 15 * 60
  const PACE_TOLERANCE = 0.10
  const TOLERANCE      = 45

  const postStart = block.endSec + RECOVERY_SKIP
  const postEnd   = postStart + WINDOW_SECS
  if (postEnd > totalSecs) return undefined

  const postSplits = timed.filter(
    s => s.tStart >= postStart - TOLERANCE && s.tEnd <= postEnd + TOLERANCE
  )
  if (postSplits.length < 2) return undefined

  const postHR   = wavg(postSplits, 'hr')
  const postPace = wavg(postSplits, 'pace')

  const paceRatio = postPace / preFastAvgPace
  if (paceRatio < 1 - PACE_TOLERANCE || paceRatio > 1 + PACE_TOLERANCE) return undefined

  return preFastAvgHR > 0
    ? parseFloat((((postHR - preFastAvgHR) / preFastAvgHR) * 100).toFixed(1))
    : undefined
}

export function analyzeLongRun(activity: {
  id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  laps?: any[]
  splits?: any[]
  run_type?: string
}, maxHr: number = DEFAULT_MAX_HR): LongRunAnalysis | null {
  const distKm      = activity.distance / 1000
  const date        = activity.start_date.split('T')[0]
  const baselinePace = activity.average_speed ? 1000 / activity.average_speed : 999
  if (!activity.average_heartrate) return null

  // Build timed-split array once; used by all sub-analyses.
  // Fall back to laps when splits aren't loaded (omitted from ACTIVITY_COLS for perf).
  const timed = buildTimedSplits((activity.splits?.length ? activity.splits : null) ?? activity.laps ?? [])

  // ── Detect fast block ────────────────────────────────────────────────────
  // Only look for fast blocks in "Long Run with Speed" (long_progressive).
  // long_easy runs are explicitly steady — never detect a fast block there.
  const isProgressive = activity.run_type === 'long_progressive'

  let runStructure: LongRunStructure = isProgressive ? 'progression' : 'steady'
  let fastBlock: FastBlock | undefined
  let fastBlockEstimates: RaceEstimate[] | undefined
  let residualElevation: number | undefined
  const allFastBlocks: FastBlock[] = []

  // Splits and duration of the pre-fast steady portion.
  // Use the last split's tEnd rather than activity.moving_time — splits use
  // elapsed_time (includes pauses) while moving_time excludes them, so using
  // moving_time would push the late window boundary past where splits exist.
  let preFastTimed    = timed
  let preFastDuration = timed.length > 0 ? timed[timed.length - 1].tEnd : activity.moving_time

  if (isProgressive) {
    // Baseline = average pace of first ~30 min (warm-up phase), fallback to overall avg.
    const blockBaseline = getFirst30MinBaseline(timed) ?? baselinePace

    // Priority 1: user-created laps (non-km splits — runner manually pressed lap button).
    const userLapBlock = detectUserLapFastBlock(activity.laps ?? [])
    if (userLapBlock) {
      userLapBlock.pctFasterThanBaseline = parseFloat(
        ((blockBaseline - userLapBlock.avgPace) / blockBaseline * 100).toFixed(1)
      )
      fastBlock = userLapBlock
    }

    // Priority 2: fastest continuous window over km splits.
    if (!fastBlock) {
      fastBlock = detectFastestWindowBlock(
        timed, blockBaseline, LONG_RUN_MIN_BLOCK_SECS, FAST_BLOCK_MIN_PCT_FASTER
      ) ?? undefined
    }

    if (fastBlock) {
      allFastBlocks.push(fastBlock)
      runStructure = fastBlock.startSec > preFastDuration * 0.75 ? 'progression' : 'fast_middle'

      // Trim to pre-fast portion for drift / steady window analysis
      preFastTimed    = timed.filter(s => s.tEnd <= fastBlock!.startSec)
      preFastDuration = fastBlock.startSec

      fastBlockEstimates = fastBlockThresholdEstimates(fastBlock, activity.id, date, maxHr)

      // Residual elevation only for fast_middle (need easy running after block)
      if (runStructure === 'fast_middle' && preFastTimed.length >= 2) {
        const preFastAvgHR   = wavg(preFastTimed, 'hr')
        const preFastAvgPace = wavg(preFastTimed, 'pace')
        residualElevation = computeResidualElevation(
          timed, fastBlock, preFastAvgHR, preFastAvgPace, activity.moving_time
        )
      }
    }
  }

  // ── Steady window from pre-fast portion ─────────────────────────────────
  // Take the last 15 min of the pre-fast splits for the HR-projection window.
  let window: SteadyWindow | null = null

  if (preFastTimed.length >= 2 && preFastDuration >= 600) {
    const TARGET_WINDOW = 15 * 60
    const windowSplits: TimedSplit[] = []
    let wSecs = 0
    for (let i = preFastTimed.length - 1; i >= 0 && wSecs < TARGET_WINDOW; i--) {
      windowSplits.unshift(preFastTimed[i])
      wSecs += preFastTimed[i].duration
    }
    const useSplits = windowSplits.length >= 1 ? windowSplits : preFastTimed
    const totalDur  = useSplits.reduce((s, sp) => s + sp.duration, 0)
    if (totalDur > 0) {
      window = {
        avgPace: wavg(useSplits, 'pace'),
        avgHR:   wavg(useSplits, 'hr'),
        splits:  useSplits.map(sp => ({ paceSecPerKm: sp.pace, hr: sp.hr, duration: sp.duration })),
        windowSecs: totalDur,
      }
    }
  }

  // Fallback to lap-based extraction for steady runs with no useful splits
  if (!window && runStructure === 'steady') {
    window = extractSteadyWindow(activity)
  }

  // Final fallback to whole-run averages
  if (!window && activity.average_heartrate && activity.average_speed) {
    window = {
      avgPace: baselinePace,
      avgHR:   activity.average_heartrate,
      splits:  [],
      windowSecs: activity.moving_time,
    }
  }

  // If no usable steady window but we have fast block estimates, still return
  if (!window || window.windowSecs < 600) {
    if (fastBlockEstimates && fastBlockEstimates.length > 0) {
      const fatigueCredit = fastBlock ? fastBlockFatigueCredit(fastBlock) : undefined
      return {
        date,
        activityId:   activity.id,
        activityName: activity.name,
        distanceKm:   parseFloat(distKm.toFixed(1)),
        overallPace:  parseFloat(baselinePace.toFixed(1)),
        overallHR:    activity.average_heartrate ?? 0,
        steadyPace:   parseFloat(baselinePace.toFixed(1)),
        steadyHR:     activity.average_heartrate ?? 0,
        cardiacDrift: 0,
        driftExcess:  0,
        driftReliable: false,
        driftPaceAdjusted: false,
        driftReason:  'no steady window — fast block only',
        windowSecs:   0,
        runStructure,
        fastBlock,
        allFastBlocks,
        fatigueCredit,
        fastBlockEstimates,
        residualElevation,
        raceEstimates: fastBlockEstimates,
        steadyDurationSecs: preFastDuration,
      }
    }
    return null
  }

  // ── Cardiac drift on pre-fast timed splits ───────────────────────────────
  const driftResult  = computeCardiacDrift(preFastTimed, preFastDuration)
  const cardiacDrift = driftResult.drift
  const overallPace  = baselinePace
  const overallHR    = activity.average_heartrate ?? 0

  // ── Race projection from steady window ───────────────────────────────────
  const hmRaceHR = maxHr * 0.87
  const fmRaceHR = maxHr * 0.82

  const hmHRDiff     = (hmRaceHR - window.avgHR) / maxHr * 100
  const fmHRDiff     = (fmRaceHR - window.avgHR) / maxHr * 100
  const hmHRGapBpm   = Math.abs(hmRaceHR - window.avgHR)
  const fmHRGapBpm   = Math.abs(fmRaceHR - window.avgHR)

  const hmPace = window.avgPace - hmHRDiff * 2.5 * (1 + 0.005 * hmHRGapBpm)
  const fmPace = window.avgPace - fmHRDiff * 2.5 * (1 + 0.005 * fmHRGapBpm)

  const hmHRGapPenalty = Math.max(0.3, 1 - (hmHRGapBpm - 10) * 0.02)
  const fmHRGapPenalty = Math.max(0.3, 1 - (fmHRGapBpm - 10) * 0.02)

  // Distance factor based on pre-fast km
  const preFastKm       = preFastTimed.reduce((s, sp) => s + sp.duration / sp.pace, 0)
  const effectiveDistKm = preFastKm > 0 ? preFastKm : distKm
  const distanceFactor  = Math.min(1, effectiveDistKm / 25)

  // Drift penalty on estimatedSecs: only applied when drift is reliably measured.
  // When unreliable, only confidence is penalized (via driftUnknownConfidenceMult).
  const hmDriftMult = driftResult.reliable ? driftPenaltyMultiplier(driftResult.excessDrift, 'hm') : 1
  const fmDriftMult = driftResult.reliable ? driftPenaltyMultiplier(driftResult.excessDrift, 'fm') : 1
  const driftUnknownConfidenceMult = driftResult.reliable ? 1 : 0.85
  const driftNote = driftResult.reliable && driftResult.excessDrift > 0
    ? ` (excess drift +${driftResult.excessDrift.toFixed(1)}%)`
    : ''

  const steadyEstimates: RaceEstimate[] = []

  if (hmPace > 200 && hmPace < 500) {
    steadyEstimates.push({
      distanceKey: 'hm',
      estimatedSecs: hmPace * 21.097 * hmDriftMult,
      confidence: 0.65 * distanceFactor * driftUnknownConfidenceMult * hmHRGapPenalty,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: `Steady pace ${formatPace(window.avgPace)}/km @ ${Math.round(window.avgHR)}bpm → HM via HR projection${driftNote}`,
    })
  }

  if (fmPace > 200 && fmPace < 500) {
    steadyEstimates.push({
      distanceKey: 'fm',
      estimatedSecs: fmPace * 42.195 * fmDriftMult,
      confidence: 0.50 * distanceFactor * driftUnknownConfidenceMult * fmHRGapPenalty,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: `Steady pace → FM via HR projection${driftNote}`,
    })
  }

  const hmSteady = steadyEstimates.find(e => e.distanceKey === 'hm')
  if (hmSteady) {
    steadyEstimates.push({
      distanceKey: '10k',
      estimatedSecs: riegelProject(hmSteady.estimatedSecs, 21.097, 10, 1.06),
      confidence: 0.35 * distanceFactor,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: 'Reverse Riegel from steady-pace HM estimate',
    })
  }

  // When there's a fast block, prefer it as the primary race estimate —
  // threshold-based Daniels method from an actual hard effort is more
  // reliable than projecting from easy-pace HR for a mixed-effort run.
  const raceEstimates = fastBlockEstimates && fastBlockEstimates.length > 0
    ? fastBlockEstimates
    : steadyEstimates
  if (raceEstimates.length === 0) return null

  const fatigueCredit = fastBlock
    ? fastBlockFatigueCredit(fastBlock)
    : undefined

  return {
    date,
    activityId:   activity.id,
    activityName: activity.name,
    distanceKm:   parseFloat(distKm.toFixed(1)),
    overallPace:  parseFloat(overallPace.toFixed(1)),
    overallHR:    parseFloat(overallHR.toFixed(1)),
    steadyPace:   parseFloat(window.avgPace.toFixed(1)),
    steadyHR:     parseFloat(window.avgHR.toFixed(1)),
    cardiacDrift: parseFloat(cardiacDrift.toFixed(1)),
    driftExcess:  parseFloat(driftResult.excessDrift.toFixed(1)),
    driftReliable: driftResult.reliable,
    driftPaceAdjusted: driftResult.paceAdjusted,
    driftReason:  driftResult.reason,
    earlyWindow:  driftResult.earlyWindow,
    lateWindow:   driftResult.lateWindow,
    windowSecs:   window.windowSecs,
    runStructure,
    fastBlock,
    allFastBlocks,
    fatigueCredit,
    fastBlockEstimates,
    residualElevation,
    raceEstimates,
    steadyDurationSecs: preFastDuration,
  }
}
