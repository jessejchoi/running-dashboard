import { type PaceZones } from '@/lib/run-classification'

export type RunSegmentType =
  | 'warmup'
  | 'cooldown'
  | 'recovery'
  | 'easy'
  | 'steady'
  | 'tempo'
  | 'threshold'
  | 'interval'
  | 'stride'

export interface SegmentLike {
  average_speed?: number | null
  average_heartrate?: number | null
  distance?: number | null
  moving_time?: number | null
  elapsed_time?: number | null
  [key: string]: unknown
}

export interface ClassifiedRunSegment {
  index: number
  startSec: number
  endSec: number
  duration: number
  distance?: number
  pace: number
  hr?: number
  hrFraction?: number
  type: RunSegmentType
  confidence: 'low' | 'medium' | 'high'
  reason: string
}

export interface RunSegmentOptions {
  avgPace?: number
  runType?: string | null
  paceZones?: PaceZones | null
  maxHr?: number | null
}

export const RUN_SEGMENT_STYLE: Record<RunSegmentType, { color: string; bandColor: string; label: string }> = {
  warmup: {
    color: '#a1a1aa',
    bandColor: 'rgba(161,161,170,0.12)',
    label: 'warmup',
  },
  cooldown: {
    color: '#6b7280',
    bandColor: 'rgba(107,114,128,0.12)',
    label: 'cooldown',
  },
  recovery: {
    color: '#3b82f6',
    bandColor: 'rgba(59,130,246,0.14)',
    label: 'recovery',
  },
  easy: {
    color: '#22c55e',
    bandColor: 'rgba(34,197,94,0.12)',
    label: 'easy',
  },
  steady: {
    color: '#22c55e',
    bandColor: 'rgba(34,197,94,0.10)',
    label: 'steady',
  },
  tempo: {
    color: '#eab308',
    bandColor: 'rgba(234,179,8,0.14)',
    label: 'tempo',
  },
  threshold: {
    color: '#f59e0b',
    bandColor: 'rgba(245,158,11,0.16)',
    label: 'threshold',
  },
  interval: {
    color: '#f97316',
    bandColor: 'rgba(249,115,22,0.16)',
    label: 'interval',
  },
  stride: {
    color: '#ef4444',
    bandColor: 'rgba(239,68,68,0.16)',
    label: 'stride',
  },
}

const INTERVAL_RUN_TYPES = new Set(['intervals', 'interval_5k', 'interval_10k'])
const THRESHOLD_RUN_TYPES = new Set(['threshold'])
const TEMPO_RUN_TYPES = new Set(['tempo'])
const EASYISH_RUN_TYPES = new Set(['recovery', 'easy', 'easy_strides'])
const LONG_RUN_TYPES = new Set(['long', 'long_easy', 'long_steady', 'long_progressive'])

function segmentDuration(segment: SegmentLike) {
  return segment.elapsed_time ?? segment.moving_time ?? 0
}

function segmentPace(segment: SegmentLike) {
  if (segment.average_speed && segment.average_speed > 0) return 1000 / segment.average_speed
  const duration = segmentDuration(segment)
  if (duration > 0 && segment.distance && segment.distance > 0) return duration / (segment.distance / 1000)
  return null
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function paceCv(paces: number[]) {
  if (paces.length < 3) return 0
  const mean = paces.reduce((sum, pace) => sum + pace, 0) / paces.length
  if (mean <= 0) return 0
  const variance = paces.reduce((sum, pace) => sum + (pace - mean) ** 2, 0) / paces.length
  return Math.sqrt(variance) / mean
}

function biggestGapThreshold(paces: number[], fallback: number, minGapSec: number) {
  const sorted = [...paces].sort((a, b) => a - b)
  let biggestGap = 0
  let threshold = fallback

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i]
    if (gap > biggestGap) {
      biggestGap = gap
      threshold = (sorted[i] + sorted[i + 1]) / 2
    }
  }

  return biggestGap >= minGapSec ? threshold : fallback
}

function consecutiveGroups(indexes: number[]) {
  if (indexes.length === 0) return [] as number[][]
  const groups: number[][] = [[indexes[0]]]
  for (let i = 1; i < indexes.length; i++) {
    const prev = indexes[i - 1]
    const curr = indexes[i]
    if (curr === prev + 1) groups[groups.length - 1].push(curr)
    else groups.push([curr])
  }
  return groups
}

function isWorkType(type: RunSegmentType) {
  return type === 'tempo' || type === 'threshold' || type === 'interval' || type === 'stride'
}

function easyBaseType(runType?: string | null): RunSegmentType {
  if (runType === 'recovery') return 'recovery'
  if (runType && LONG_RUN_TYPES.has(runType)) return 'steady'
  if (runType && EASYISH_RUN_TYPES.has(runType)) return 'easy'
  return 'steady'
}

function hrFraction(hr: number | undefined, maxHr?: number | null) {
  if (!hr || !maxHr || maxHr < 150 || maxHr > 230) return undefined
  return hr / maxHr
}

function classifyWithZones(
  pace: number,
  duration: number,
  hr: number | undefined,
  options: RunSegmentOptions,
): { type: RunSegmentType; confidence: ClassifiedRunSegment['confidence']; reason: string } {
  const zones = options.paceZones
  const hrFrac = hrFraction(hr, options.maxHr)
  const base = easyBaseType(options.runType)

  if (!zones) {
    const avgPace = options.avgPace || pace
    if (options.runType === 'easy_strides' && duration <= 45 && pace <= avgPace * 0.82) {
      return { type: 'stride', confidence: 'medium', reason: 'short burst faster than easy-stride pace' }
    }
    if (options.runType && INTERVAL_RUN_TYPES.has(options.runType) && pace <= avgPace * 0.92) {
      return { type: 'interval', confidence: 'medium', reason: 'faster than interval-session baseline' }
    }
    if (options.runType && THRESHOLD_RUN_TYPES.has(options.runType) && pace <= avgPace * 0.985) {
      return { type: 'threshold', confidence: 'medium', reason: 'faster than threshold-session baseline' }
    }
    if (options.runType && TEMPO_RUN_TYPES.has(options.runType) && pace <= avgPace * 0.985) {
      return { type: 'tempo', confidence: 'medium', reason: 'faster than tempo-session baseline' }
    }
    if (options.runType === 'long_progressive' && pace <= avgPace * 0.97) {
      return { type: 'tempo', confidence: 'medium', reason: 'faster block in progressive long run' }
    }
    if (options.runType === 'easy_strides') {
      return { type: 'easy', confidence: 'medium', reason: 'easy-stride baseline segment' }
    }
    if (pace >= avgPace * 1.12) {
      return { type: 'recovery', confidence: 'low', reason: 'slower than run baseline' }
    }
    if (pace <= avgPace * 0.88) {
      return { type: 'tempo', confidence: 'low', reason: 'faster than run baseline' }
    }
    return { type: base, confidence: 'low', reason: 'relative baseline fallback' }
  }

  if (duration <= 45 && pace <= zones.intervalMaxPace * 1.03) {
    return { type: 'stride', confidence: 'high', reason: 'short segment at interval-speed pace' }
  }
  if (pace <= zones.intervalMaxPace) {
    return { type: 'interval', confidence: 'high', reason: 'pace faster than interval boundary' }
  }
  if (pace <= zones.thresholdMaxPace) {
    return { type: 'threshold', confidence: 'high', reason: 'pace faster than threshold boundary' }
  }
  if (pace <= zones.tempoMaxPace) {
    return { type: 'tempo', confidence: 'high', reason: 'pace faster than tempo boundary' }
  }

  if (hrFrac && hrFrac >= 0.94 && pace < zones.easyMaxPace) {
    return { type: 'threshold', confidence: 'medium', reason: 'very high HR at sub-easy pace' }
  }
  if (hrFrac && hrFrac >= 0.88 && pace < zones.easyMaxPace) {
    return { type: 'tempo', confidence: 'medium', reason: 'hard HR at sub-easy pace' }
  }
  if (pace > zones.easyMaxPace * 1.05) {
    return { type: 'recovery', confidence: 'high', reason: 'pace slower than easy boundary' }
  }
  if (hrFrac && hrFrac < 0.68 && pace >= zones.tempoMaxPace) {
    return { type: 'recovery', confidence: 'medium', reason: 'low HR aerobic/recovery segment' }
  }

  return { type: base, confidence: 'medium', reason: 'within easy/steady zone' }
}

function applyGapFallback(
  segments: ClassifiedRunSegment[],
  options: RunSegmentOptions,
) {
  if (options.paceZones || segments.length < 2) return

  const paces = segments.map(segment => segment.pace)
  const avgPace = options.avgPace || median(paces)
  let threshold: number | null = null
  let workType: RunSegmentType = 'tempo'

  if (options.runType && INTERVAL_RUN_TYPES.has(options.runType)) {
    threshold = biggestGapThreshold(paces, avgPace * 0.95, 12)
    workType = 'interval'
  } else if (options.runType && THRESHOLD_RUN_TYPES.has(options.runType)) {
    threshold = biggestGapThreshold(paces, avgPace * 0.985, 8)
    workType = 'threshold'
  } else if (options.runType && TEMPO_RUN_TYPES.has(options.runType)) {
    threshold = biggestGapThreshold(paces, avgPace * 0.985, 8)
    workType = 'tempo'
  } else if (options.runType === 'long_progressive') {
    threshold = biggestGapThreshold(paces, avgPace * 0.97, 6)
    workType = 'tempo'
  }

  if (!threshold) return
  for (const segment of segments) {
    if (segment.pace < threshold) {
      segment.type = workType
      segment.confidence = 'medium'
      segment.reason = 'pace-gap structure fallback'
    }
  }
}

function applyStructureLabels(
  segments: ClassifiedRunSegment[],
  options: RunSegmentOptions,
) {
  const workIndexes = segments.flatMap((segment, index) => isWorkType(segment.type) ? [index] : [])
  if (workIndexes.length === 0) {
    labelSlowEdges(segments)
    return
  }

  if (options.runType === 'long_progressive') {
    labelSlowEdges(segments)
    return
  }

  const firstWork = workIndexes[0]
  const lastWork = workIndexes[workIndexes.length - 1]
  const groups = consecutiveGroups(workIndexes)

  if (options.runType !== 'easy_strides') {
    for (let i = 0; i < firstWork; i++) {
      if (!isWorkType(segments[i].type)) {
        segments[i].type = 'warmup'
        segments[i].reason = `${segments[i].reason}; before first work segment`
      }
    }
  }

  if (options.runType && INTERVAL_RUN_TYPES.has(options.runType)) {
    for (let i = lastWork + 1; i < segments.length; i++) {
      if (isWorkType(segments[i].type)) continue
      segments[i].type = i === segments.length - 1 ? 'cooldown' : 'recovery'
      segments[i].reason = `${segments[i].reason}; after final interval rep`
    }
  } else {
    for (let i = lastWork + 1; i < segments.length; i++) {
      if (!isWorkType(segments[i].type)) {
        segments[i].type = 'cooldown'
        segments[i].reason = `${segments[i].reason}; after last work segment`
      }
    }
  }

  if (options.runType && INTERVAL_RUN_TYPES.has(options.runType)) {
    for (let i = 0; i < firstWork; i++) {
      if (isWorkType(segments[i].type)) continue
      segments[i].type = 'warmup'
      segments[i].reason = `${segments[i].reason}; before first work segment`
    }
  }

  if (groups.length > 1) {
    for (let i = firstWork + 1; i < lastWork; i++) {
      if (isWorkType(segments[i].type)) continue
      segments[i].type = 'recovery'
      segments[i].reason = `${segments[i].reason}; between repeated work segments`
    }
  }

  if (options.runType === 'easy_strides') {
    for (const segment of segments) {
      if (segment.type === 'interval') segment.type = 'stride'
    }
  }
}

function labelSlowEdges(segments: ClassifiedRunSegment[]) {
  if (segments.length < 3) return
  const baseline = median(segments.map(segment => segment.pace))
  if (baseline <= 0) return

  const first = segments[0]
  const last = segments[segments.length - 1]
  if (first.pace > baseline * 1.03 && !isWorkType(first.type)) {
    first.type = 'warmup'
    first.reason = `${first.reason}; slow opening segment`
  }
  if (last.pace > baseline * 1.03 && !isWorkType(last.type)) {
    last.type = 'cooldown'
    last.reason = `${last.reason}; slow closing segment`
  }
}

function smoothTinyOutliers(segments: ClassifiedRunSegment[]) {
  for (let i = 1; i < segments.length - 1; i++) {
    const segment = segments[i]
    if (segment.duration > 20 || segment.type !== 'recovery') continue
    const prev = segments[i - 1]
    const next = segments[i + 1]
    if (prev.type === next.type && isWorkType(prev.type)) {
      segment.type = prev.type
      segment.confidence = 'low'
      segment.reason = `${segment.reason}; smoothed tiny interruption`
    }
  }
}

export function classifyRunSegments(
  rawSegments: SegmentLike[],
  options: RunSegmentOptions = {},
): ClassifiedRunSegment[] {
  let cursor = 0
  const segments = rawSegments.flatMap((raw, index) => {
    const duration = segmentDuration(raw)
    const startSec = cursor
    if (duration > 0) cursor += duration
    const pace = segmentPace(raw)
    if (!pace || pace <= 0 || pace >= 900 || duration <= 0) return []
    const hr = raw.average_heartrate ?? undefined
    const classified = classifyWithZones(pace, duration, hr, options)
    return [{
      index,
      startSec,
      endSec: cursor,
      duration,
      distance: raw.distance ?? undefined,
      pace,
      hr,
      hrFraction: hrFraction(hr, options.maxHr),
      ...classified,
    }]
  })

  if (segments.length === 0) return []

  const paces = segments.map(segment => segment.pace)
  const cv = paceCv(paces)
  if (!options.paceZones && cv < 0.05 && !['easy_strides', 'long_progressive'].includes(options.runType ?? '')) {
    labelSlowEdges(segments)
    return segments
  }

  applyGapFallback(segments, options)
  smoothTinyOutliers(segments)
  applyStructureLabels(segments, options)
  return segments
}

export function segmentTypes(
  rawSegments: SegmentLike[],
  options: RunSegmentOptions = {},
): RunSegmentType[] {
  return classifyRunSegments(rawSegments, options).map(segment => segment.type)
}
