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
  if (n === 0) return []

  // Use bimodal split: find the natural gap between fast and slow laps
  // Sort paces, look for the biggest gap — that's the interval/recovery boundary
  const sorted = [...paces].sort((a, b) => a - b)
  let biggestGap = 0
  let threshold = avgPace
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i]
    if (gap > biggestGap) {
      biggestGap = gap
      threshold = (sorted[i] + sorted[i + 1]) / 2
    }
  }

  // Only use bimodal threshold if gap is significant (>25s/km difference)
  // Otherwise fall back to % of avg
  const useThreshold = biggestGap > 25
    ? threshold
    : avgPace * 0.94  // fallback: 6% faster = interval

  const raw: LapType[] = paces.map(p =>
    p < useThreshold ? 'interval' : 'recovery'
  )

  // Find first and last interval
  let firstFastIdx = raw.findIndex(t => t === 'interval')
  let lastFastIdx = n - 1 - [...raw].reverse().findIndex(t => t === 'interval')
  if (firstFastIdx === -1) {
    // No intervals detected — everything is steady
    return paces.map(() => 'steady')
  }

  return raw.map((t, i) => {
    if (t === 'interval') return 'interval'
    if (i < firstFastIdx) return 'warmup'
    if (i > lastFastIdx) return 'cooldown'
    return 'recovery'
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
