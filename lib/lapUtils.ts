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

  // ── THRESHOLDS ──────────────────────────────────────────────────────────────
  // Stride: >30% faster than avg pace
  const STRIDE_FAST   = avgPace * 0.70   // pace < this = stride/interval
  // Recovery jog: >30% slower than avg pace  
  const RECOVERY_SLOW = avgPace * 1.30   // pace > this = recovery jog

  // Tag each lap
  const raw = paces.map(p =>
    p < STRIDE_FAST   ? 'interval' :
    p > RECOVERY_SLOW ? 'recovery' :
    'steady'
  ) as LapType[]

  // Find first and last interval lap
  const firstInt = raw.findIndex(t => t === 'interval')
  const lastInt  = n - 1 - [...raw].reverse().findIndex(t => t === 'interval')

  if (firstInt === -1) {
    // No strides/intervals at all — everything steady
    return raw.map(() => 'steady')
  }

  if (isEasy) {
    // Easy run with strides:
    // - Pre-stride laps that are steady-pace → 'steady' (main run body)
    // - Pre-stride laps that are recovery-pace (very slow) → 'recovery'
    // - Strides → 'interval'
    // - Between strides → 'recovery'
    // - After last stride → 'cooldown'
    return raw.map((t, i) => {
      if (t === 'interval') return 'interval'
      if (i > lastInt)  return 'cooldown'
      // Both pre-stride and between-stride: use the raw tag (steady or recovery)
      return t === 'recovery' ? 'recovery' : 'steady'
    })
  }

  // ── INTERVAL/THRESHOLD RUN ──────────────────────────────────────────────────
  // Use bimodal gap detection for the fast/slow boundary
  const sorted = [...paces].sort((a, b) => a - b)
  let biggestGap = 0
  let bimodalThreshold = avgPace
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i]
    if (gap > biggestGap) {
      biggestGap = gap
      bimodalThreshold = (sorted[i] + sorted[i + 1]) / 2
    }
  }
  const useThreshold = biggestGap > 25 ? bimodalThreshold : avgPace * 0.94

  const hardRaw = paces.map(p => p < useThreshold ? 'interval' : 'other') as string[]
  const firstFast = hardRaw.findIndex(t => t === 'interval')
  const lastFast  = n - 1 - [...hardRaw].reverse().findIndex(t => t === 'interval')

  if (firstFast === -1) return paces.map(() => 'steady')

  return hardRaw.map((t, i) => {
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
    const dur = s.moving_time ?? s.elapsed_time ?? 60
    const seg: LapSegment = { startSec: cursor, endSec: cursor + dur, type: types[i] }
    cursor += dur
    return seg
  })
}
