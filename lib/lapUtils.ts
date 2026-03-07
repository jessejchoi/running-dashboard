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

  // ── EASY RUNS: use 30% threshold to find strides ───────────────────────────
  if (isEasy) {
    const STRIDE_FAST   = avgPace * 0.70  // >30% faster = stride
    const RECOVERY_SLOW = avgPace * 1.30  // >30% slower = recovery jog

    const raw = paces.map(p =>
      p < STRIDE_FAST   ? 'interval' :
      p > RECOVERY_SLOW ? 'recovery' :
      'steady'
    ) as LapType[]

    const firstInt = raw.findIndex(t => t === 'interval')
    const lastInt  = n - 1 - [...raw].reverse().findIndex(t => t === 'interval')

    if (firstInt === -1) return paces.map(() => 'steady')

    return raw.map((t, i) => {
      if (t === 'interval') return 'interval'
      if (i > lastInt) return 'cooldown'
      return t === 'recovery' ? 'recovery' : 'steady'
    })
  }

  // ── INTERVAL / THRESHOLD RUNS: bimodal gap detection ──────────────────────
  // Find the biggest pace gap between any two adjacent sorted values.
  // This naturally separates fast intervals from slow recovery laps.
  const sorted = [...paces].sort((a, b) => a - b)
  let biggestGap = 0
  let bimodalThreshold = avgPace * 0.94  // fallback if no clear gap
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i]
    if (gap > biggestGap) {
      biggestGap = gap
      bimodalThreshold = (sorted[i] + sorted[i + 1]) / 2
    }
  }
  // Only trust bimodal split if gap is at least 15 sec/km
  const useThreshold = biggestGap >= 15 ? bimodalThreshold : avgPace * 0.94

  const tagged = paces.map(p => p < useThreshold ? 'interval' : 'other')
  const firstFast = tagged.findIndex(t => t === 'interval')
  const lastFast  = n - 1 - [...tagged].reverse().findIndex(t => t === 'interval')

  if (firstFast === -1) return paces.map(() => 'steady')

  return tagged.map((t, i) => {
    if (t === 'interval') return 'interval'
    if (i < firstFast) return 'warmup'
    if (i > lastFast)  return 'cooldown'
    return 'recovery'
  }) as LapType[]
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
