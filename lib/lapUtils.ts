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

const EASY_RUN_TYPES = new Set(['recovery', 'easy', 'easy_strides', 'long_easy', 'long_progressive'])

export function categorizeLaps(splits: Split[], avgPace: number, runType?: string | null): LapType[] {
  const paces = splits.map(s => s.average_speed ? 1000 / s.average_speed : 999)
  const n = paces.length
  if (n === 0) return []

  const isEasy = runType ? EASY_RUN_TYPES.has(runType) : false

  // Bimodal gap detection
  const sorted = [...paces].sort((a, b) => a - b)
  let biggestGap = 0
  let threshold = avgPace
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i]
    if (gap > biggestGap) { biggestGap = gap; threshold = (sorted[i] + sorted[i + 1]) / 2 }
  }

  // For easy runs: only mark as interval if truly stride-pace (>18% faster than avg)
  // For hard runs: use bimodal gap if significant, else 6% threshold
  let useThreshold: number
  if (isEasy) {
    useThreshold = avgPace * 0.82  // only real strides qualify as intervals
  } else {
    useThreshold = biggestGap > 25 ? threshold : avgPace * 0.94
  }

  const raw: LapType[] = paces.map(p =>
    p < useThreshold ? 'interval' : isEasy ? 'steady' : 'recovery'
  )

  let firstFastIdx = raw.findIndex(t => t === 'interval')
  let lastFastIdx = n - 1 - [...raw].reverse().findIndex(t => t === 'interval')
  if (firstFastIdx === -1) {
    return paces.map(() => isEasy ? 'steady' : 'steady')
  }

  return raw.map((t, i) => {
    if (t === 'interval') return 'interval'
    if (i < firstFastIdx) return 'warmup'
    if (i > lastFastIdx) return 'cooldown'
    return t  // 'steady' for easy, 'recovery' for intervals
  })
}

export function buildLapSegments(splits: Split[], avgPace: number, runType?: string | null): LapSegment[] {
  const types = categorizeLaps(splits, avgPace, runType)
  let cursor = 0
  return splits.map((s, i) => {
    const dur = s.moving_time ?? s.elapsed_time ?? 60
    const seg: LapSegment = { startSec: cursor, endSec: cursor + dur, type: types[i] }
    cursor += dur
    return seg
  })
}
