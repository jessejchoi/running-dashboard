export type LapType = 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'steady'

export interface LapSegment {
  startSec: number
  endSec: number
  type: LapType
}

interface Split {
  average_speed?: number
  moving_time?: number
  elapsed_time?: number
  [key: string]: any
}

const INTERVAL_RUN_TYPES = new Set(['intervals', 'interval_5k', 'interval_10k'])
const THRESHOLD_RUN_TYPES = new Set(['threshold', 'tempo'])
const EASYISH_RUN_TYPES = new Set(['recovery', 'easy', 'easy_strides'])
const LONG_RUN_TYPES = new Set(['long', 'long_easy', 'long_steady', 'long_progressive'])

function getPaces(splits: Split[]) {
  return splits.map(s => (s.average_speed ? 1000 / s.average_speed : 999))
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
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

function labelSlowEdges(types: LapType[], paces: number[], baseline: number) {
  if (paces.length < 3 || baseline <= 0) return types

  const first = paces[0]
  const last = paces[paces.length - 1]
  if (first > baseline * 1.03) types[0] = 'warmup'
  if (last > baseline * 1.03) types[paces.length - 1] = 'cooldown'
  return types
}

export function categorizeLaps(splits: Split[], avgPace: number, runType?: string | null): LapType[] {
  const paces = getPaces(splits)
  const n = paces.length
  if (n === 0) return []

  const types: LapType[] = paces.map(() => 'steady')
  const midPace = median(paces)

  if (runType && INTERVAL_RUN_TYPES.has(runType)) {
    const threshold = biggestGapThreshold(paces, avgPace * 0.95, 12)
    const fastIdx = paces.flatMap((pace, i) => pace < threshold ? [i] : [])
    if (fastIdx.length === 0) return types

    const firstFast = fastIdx[0]
    const lastFast = fastIdx[fastIdx.length - 1]
    for (const i of fastIdx) types[i] = 'interval'
    for (let i = 0; i < firstFast; i++) types[i] = 'warmup'
    for (let i = firstFast; i <= lastFast; i++) {
      if (types[i] === 'steady') types[i] = 'recovery'
    }
    if (lastFast + 1 < n) {
      for (let i = lastFast + 1; i < n - 1; i++) types[i] = 'recovery'
      types[n - 1] = 'cooldown'
    }
    return types
  }

  if (runType && THRESHOLD_RUN_TYPES.has(runType)) {
    const threshold = biggestGapThreshold(paces, avgPace * 0.985, 8)
    const fastIdx = paces.flatMap((pace, i) => pace < threshold ? [i] : [])
    if (fastIdx.length === 0) return labelSlowEdges(types, paces, midPace)

    const groups = consecutiveGroups(fastIdx)
    const firstFast = fastIdx[0]
    const lastFast = fastIdx[fastIdx.length - 1]

    for (const i of fastIdx) types[i] = 'interval'
    for (let i = 0; i < firstFast; i++) types[i] = 'warmup'
    for (let i = lastFast + 1; i < n; i++) types[i] = 'cooldown'

    if (groups.length > 1) {
      for (let i = firstFast; i <= lastFast; i++) {
        if (types[i] === 'steady') types[i] = 'recovery'
      }
    }

    return types
  }

  if (runType === 'long_progressive') {
    const threshold = biggestGapThreshold(paces, avgPace * 0.97, 6)
    const fastIdx = paces.flatMap((pace, i) => pace < threshold ? [i] : [])
    for (const i of fastIdx) types[i] = 'interval'
    return labelSlowEdges(types, paces, midPace)
  }

  if (runType && LONG_RUN_TYPES.has(runType)) {
    return labelSlowEdges(types, paces, midPace)
  }

  if (runType === 'easy_strides') {
    const fastIdx = splits.flatMap((split, i) => {
      const duration = split.moving_time ?? split.elapsed_time ?? 0
      return duration > 0 && duration <= 45 && paces[i] < avgPace * 0.82 ? [i] : []
    })
    if (fastIdx.length === 0) return types

    const firstFast = fastIdx[0]
    const lastFast = fastIdx[fastIdx.length - 1]
    for (const i of fastIdx) types[i] = 'interval'
    for (let i = firstFast; i <= lastFast; i++) {
      if (types[i] !== 'interval' && paces[i] > avgPace * 1.04) types[i] = 'recovery'
    }
    for (let i = lastFast + 1; i < n; i++) {
      if (types[i] === 'steady') types[i] = 'cooldown'
    }
    return types
  }

  if (runType && EASYISH_RUN_TYPES.has(runType)) {
    for (let i = 0; i < n; i++) {
      if (paces[i] < avgPace * 0.88) types[i] = 'interval'
      else if (paces[i] > avgPace * 1.12) types[i] = 'recovery'
    }
    return types
  }

  return labelSlowEdges(types, paces, midPace)
}

export function buildLapSegments(splits: Split[], avgPace: number, runType?: string | null): LapSegment[] {
  const types = categorizeLaps(splits, avgPace, runType)
  let cursor = 0
  return splits.map((s, i) => {
    const dur = s.elapsed_time ?? s.moving_time ?? 60  // use elapsed so it matches stream time
    const seg: LapSegment = { startSec: cursor, endSec: cursor + dur, type: types[i] }
    cursor += dur
    return seg
  })
}
