import { type ActivityLike, type PaceZones, type RunType, type Segment } from './types'

function segmentPace(segment: Segment) {
  if (segment.average_speed && segment.average_speed > 0) return 1000 / segment.average_speed
  if (segment.moving_time && segment.distance && segment.distance > 0) return segment.moving_time / (segment.distance / 1000)
  return null
}

function validSegments(segments: Segment[]) {
  return segments
    .map(segment => {
      const pace = segmentPace(segment)
      const duration = segment.moving_time ?? segment.elapsed_time ?? 0
      return pace && pace > 0 && pace < 600 && duration > 0
        ? { pace, duration }
        : null
    })
    .filter((segment): segment is { pace: number; duration: number } => segment !== null)
}

function paceCv(paces: number[]) {
  if (paces.length < 3) return 0
  const mean = paces.reduce((a, b) => a + b, 0) / paces.length
  if (mean <= 0) return 0
  const variance = paces.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / paces.length
  return Math.sqrt(variance) / mean
}

function countFastReps(
  segments: { pace: number; duration: number }[],
  fastPace: number,
  minDuration: number,
  maxDuration?: number,
) {
  return segments.reduce((count, segment) => {
    if (segment.duration < minDuration) return count
    if (maxDuration && segment.duration > maxDuration) return count
    return segment.pace <= fastPace ? count + 1 : count
  }, 0)
}

function repStructure(
  segments: { pace: number; duration: number }[],
  fastPace: number,
  recoveryPace: number,
  minRepDuration: number,
  maxRepDuration?: number,
) {
  const repIndexes = segments.flatMap((segment, i) => {
    if (segment.duration < minRepDuration) return []
    if (maxRepDuration && segment.duration > maxRepDuration) return []
    return segment.pace <= fastPace ? [i] : []
  })
  if (repIndexes.length === 0) return { repCount: 0, recoveryCount: 0 }

  let recoveryCount = 0
  for (let i = 0; i < repIndexes.length - 1; i++) {
    const start = repIndexes[i] + 1
    const end = repIndexes[i + 1]
    const hasRecovery = segments.slice(start, end).some(segment => segment.pace >= recoveryPace)
    if (hasRecovery) recoveryCount++
  }

  return { repCount: repIndexes.length, recoveryCount }
}

function longestFastBlock(
  segments: { pace: number; duration: number }[],
  fastPace: number,
) {
  let longest = 0
  let current = 0

  for (const segment of segments) {
    if (segment.pace <= fastPace) {
      current += segment.duration
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }

  return longest
}

function longRunType(
  segments: { pace: number; duration: number }[],
  avgPaceSeconds: number,
  zones: PaceZones,
) {
  const progressionBlockPace = Math.min(zones.tempoMaxPace * 1.03, zones.easyMaxPace * 0.95)
  const fastBlockSecs = longestFastBlock(segments, progressionBlockPace)
  const fastLaps = segments.filter(segment => segment.pace <= progressionBlockPace).length
  const progressive = fastBlockSecs >= 600 || fastLaps >= Math.max(2, Math.floor(segments.length / 3))
  if (progressive) return 'long_progressive'

  if (avgPaceSeconds <= zones.easyMaxPace * 0.94) return 'long_steady'
  return 'long_easy'
}

export function progressiveCheck(splits: Segment[]): 'long_progressive' | 'long_easy' {
  const segments = validSegments(splits)
  const third = Math.floor(segments.length / 3)
  if (third >= 2) {
    const first = segments.slice(0, third)
    const last = segments.slice(segments.length - third)
    const firstAvg = first.reduce((sum, segment) => sum + segment.pace, 0) / first.length
    const lastAvg = last.reduce((sum, segment) => sum + segment.pace, 0) / last.length
    if (firstAvg > 0 && lastAvg > 0 && (firstAvg - lastAvg) / firstAvg > 0.07) return 'long_progressive'
  }
  return 'long_easy'
}

export function categorizeRun(
  activity: ActivityLike,
  zones?: PaceZones,
  maxHr?: number,
): RunType {
  const distanceKm = activity.distance / 1000
  const avgPaceSeconds = activity.average_speed ? 1000 / activity.average_speed : 999
  const hr = activity.average_heartrate ?? 0
  const segments = validSegments(activity.laps ?? activity.splits ?? [])
  const paces = segments.map(segment => segment.pace)
  const paceCV = paceCv(paces)
  const maxSplitPace = paces.length > 0 ? Math.min(...paces) : avgPaceSeconds

  if (!zones) {
    if (paceCV > 0.12 || (maxSplitPace < 230 && distanceKm < 18)) return 'intervals'
    if (distanceKm >= 12) return progressiveCheck(activity.laps ?? activity.splits ?? [])
    if (avgPaceSeconds < 290 && avgPaceSeconds > 230 && paceCV < 0.08) return 'threshold'
    if (avgPaceSeconds < 340 && avgPaceSeconds > 270 && paceCV < 0.08) return 'tempo'
    if (avgPaceSeconds > 380 || (hr > 0 && hr < 135)) return 'recovery'
    return 'easy'
  }

  const intervalReps = repStructure(segments, zones.intervalMaxPace, zones.thresholdMaxPace * 1.02, 45, 600)
  const thresholdReps = repStructure(segments, zones.thresholdMaxPace, zones.thresholdMaxPace * 1.08, 120, 1800)
  const thresholdBlockSecs = longestFastBlock(segments, zones.thresholdMaxPace)
  const tempoBlockSecs = longestFastBlock(segments, zones.tempoMaxPace)
  const shortBursts = countFastReps(segments, zones.intervalMaxPace, 12, 45)

  if (distanceKm >= zones.longRunThresholdKm) {
    return longRunType(segments, avgPaceSeconds, zones)
  }

  if (intervalReps.repCount >= 2 && intervalReps.recoveryCount >= 1) return 'intervals'
  if (paceCV > 0.14 && countFastReps(segments, zones.intervalMaxPace, 45, 900) >= 2) return 'intervals'

  const hasStructuredThreshold = thresholdReps.repCount >= 2 && thresholdReps.recoveryCount >= 1
  const hasContinuousThreshold = thresholdBlockSecs >= 12 * 60
  if (hasStructuredThreshold || hasContinuousThreshold) return 'threshold'

  const hasContinuousTempo = tempoBlockSecs >= 15 * 60 || (avgPaceSeconds <= zones.tempoMaxPace && paceCV < 0.08)
  if (hasContinuousTempo) return 'tempo'

  if (avgPaceSeconds > zones.tempoMaxPace && shortBursts >= 2) return 'easy_strides'

  if (avgPaceSeconds > zones.easyMaxPace) return 'recovery'
  if (maxHr && hr > 0 && hr < maxHr * 0.70) return 'recovery'

  return 'easy'
}
