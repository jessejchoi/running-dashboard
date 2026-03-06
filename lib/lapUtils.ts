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

export function categorizeLaps(splits: Split[], avgPace: number): LapType[] {
  const paces = splits.map(s => s.average_speed ? 1000 / s.average_speed : 999)
  const n = paces.length
  const isFast = (p: number) => p < avgPace * 0.88
  const isSlow = (p: number) => p > avgPace * 1.15

  const raw: LapType[] = paces.map(p =>
    isFast(p) ? 'interval' : isSlow(p) ? 'recovery' : 'steady'
  )

  let firstFastIdx = raw.findIndex(t => t === 'interval')
  let lastFastIdx = n - 1 - [...raw].reverse().findIndex(t => t === 'interval')
  if (firstFastIdx === -1) { firstFastIdx = n; lastFastIdx = -1 }

  return raw.map((t, i) => {
    if (t !== 'recovery' && t !== 'steady') return t
    if (i < firstFastIdx) return 'warmup'
    if (i > lastFastIdx) return 'cooldown'
    return t
  })
}

export function buildLapSegments(splits: Split[], avgPace: number): LapSegment[] {
  const types = categorizeLaps(splits, avgPace)
  let cursor = 0
  return splits.map((s, i) => {
    const dur = s.moving_time ?? s.elapsed_time ?? 60
    const seg: LapSegment = { startSec: cursor, endSec: cursor + dur, type: types[i] }
    cursor += dur
    return seg
  })
}
