// ─── Shared steady-window extraction ─────────────────────────────────────────

export interface SteadyWindow {
  avgPace: number
  avgHR: number
  splits: { paceSecPerKm: number; hr: number; duration: number }[]
  windowSecs: number
}

export interface TimedSplit {
  tStart: number
  tEnd: number
  hr: number
  pace: number    // sec/km
  duration: number
}

export function buildTimedSplits(splits: any[]): TimedSplit[] {
  const timed: TimedSplit[] = []
  let cumSec = 0
  for (const sp of splits) {
    const dur = sp.elapsed_time ?? sp.moving_time ?? 60
    if (sp.average_heartrate && sp.average_speed) {
      timed.push({
        tStart: cumSec,
        tEnd: cumSec + dur,
        hr: sp.average_heartrate,
        pace: 1000 / sp.average_speed,
        duration: dur,
      })
    }
    cumSec += dur
  }
  return timed
}

// Weighted average helpers for TimedSplit arrays
export function wavg(splits: TimedSplit[], field: 'hr' | 'pace'): number {
  const totalDur = splits.reduce((s, sp) => s + sp.duration, 0)
  return totalDur > 0 ? splits.reduce((s, sp) => s + sp[field] * sp.duration, 0) / totalDur : 0
}

export function extractSteadyWindow(activity: {
  laps?: any[]
  splits?: any[]
  average_heartrate?: number
  average_speed?: number
}): SteadyWindow | null {
  const TARGET_WINDOW = 15 * 60
  const laps: any[] = activity.laps ?? []

  // Find target lap (last lap >= 15 min)
  let targetLap: any = null
  for (let i = laps.length - 1; i >= 0; i--) {
    const lapTime = laps[i].moving_time ?? laps[i].elapsed_time ?? 0
    if (lapTime >= TARGET_WINDOW) {
      targetLap = laps[i]
      break
    }
  }

  if (!targetLap) {
    // No single lap >= 15 min (e.g. Garmin 1km auto-laps, each ~5 min).
    // Accumulate consecutive laps from the end of the run to build the window.
    const windowLaps: any[] = []
    let wSecs = 0
    for (let i = laps.length - 1; i >= 0 && wSecs < TARGET_WINDOW; i--) {
      const lapTime = laps[i].moving_time ?? laps[i].elapsed_time ?? 0
      if (lapTime > 0) {
        windowLaps.unshift(laps[i])
        wSecs += lapTime
      }
    }
    if (wSecs >= TARGET_WINDOW) {
      const lapSplits = windowLaps
        .filter((l: any) => l.average_heartrate && l.average_speed)
        .map((l: any) => ({
          paceSecPerKm: 1000 / l.average_speed,
          hr: l.average_heartrate,
          duration: l.moving_time ?? l.elapsed_time ?? 0,
        }))
      if (lapSplits.length >= 1) {
        const totalDur = lapSplits.reduce((s: number, sp: any) => s + sp.duration, 0)
        if (totalDur > 0) {
          return {
            avgPace: lapSplits.reduce((s: number, sp: any) => s + sp.paceSecPerKm * sp.duration, 0) / totalDur,
            avgHR: lapSplits.reduce((s: number, sp: any) => s + sp.hr * sp.duration, 0) / totalDur,
            splits: lapSplits,
            windowSecs: totalDur,
          }
        }
      }
    }
    return null
  }

  // Compute target lap's start time
  let lapStartSec = 0
  for (const lap of laps) {
    if (lap === targetLap) break
    lapStartSec += lap.elapsed_time ?? lap.moving_time ?? 0
  }
  const lapDurSec = targetLap.moving_time ?? targetLap.elapsed_time ?? 0
  const lapEndSec = lapStartSec + lapDurSec

  // Map km splits to cumulative time, filter to target lap
  const kmSplits: any[] = activity.splits ?? []
  let cumSec = 0
  const timedKmSplits = kmSplits.map((sp: any) => {
    const dur = sp.elapsed_time ?? sp.moving_time ?? 60
    const item = { sp, tStart: cumSec, tEnd: cumSec + dur }
    cumSec += dur
    return item
  })

  const lapKmSplits = timedKmSplits
    .filter(ts => ts.tStart >= lapStartSec - 30 && ts.tEnd <= lapEndSec + 30)
    .filter(ts => ts.sp.average_heartrate && ts.sp.average_speed)
    .map(ts => ({
      paceSecPerKm: 1000 / ts.sp.average_speed,
      hr: ts.sp.average_heartrate,
      duration: ts.sp.elapsed_time ?? ts.sp.moving_time ?? 60,
    }))

  if (lapKmSplits.length >= 1) {
    // Take last 15 min
    const windowSplits: typeof lapKmSplits = []
    let wSecs = 0
    for (let i = lapKmSplits.length - 1; i >= 0 && wSecs < TARGET_WINDOW; i--) {
      windowSplits.unshift(lapKmSplits[i])
      wSecs += lapKmSplits[i].duration
    }
    const useSplits = windowSplits.length >= 1 ? windowSplits : lapKmSplits
    const totalDur = useSplits.reduce((s, sp) => s + sp.duration, 0)
    if (totalDur > 0) {
      return {
        avgPace: useSplits.reduce((s, sp) => s + sp.paceSecPerKm * sp.duration, 0) / totalDur,
        avgHR: useSplits.reduce((s, sp) => s + sp.hr * sp.duration, 0) / totalDur,
        splits: useSplits,
        windowSecs: totalDur,
      }
    }
  }

  // Fallback to target lap averages
  if (targetLap.average_heartrate && targetLap.average_speed) {
    return {
      avgPace: 1000 / targetLap.average_speed,
      avgHR: targetLap.average_heartrate,
      splits: [],
      windowSecs: lapDurSec,
    }
  }

  return null
}
