import { type DistanceKey, type RaceEstimate, type RaceResultAnalysis } from './types'
import { DISTANCE_KM, riegelProject } from './riegel'
// ─── Race result detector ────────────────────────────────────────────────────

const RACE_NAME_PATTERN = /\b(race|parkrun|marathon|5k|10k|hm|half.?marathon)\b/i
const STANDARD_DISTANCES: { key: DistanceKey; km: number }[] = [
  { key: '5k', km: 5 },
  { key: '10k', km: 10 },
  { key: 'hm', km: 21.097 },
  { key: 'fm', km: 42.195 },
]

export function detectAndAnalyzeRace(activity: {
  id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  is_race?: boolean
  matched_distance_key?: string
  raw?: any
}): RaceResultAnalysis | null {
  // Detection: Strava workout_type === 1, is_race flag, or name pattern
  const isRace = activity.is_race ||
    activity.raw?.workout_type === 1 ||
    RACE_NAME_PATTERN.test(activity.name)

  if (!isRace) return null

  const distKm = activity.distance / 1000

  // Match to nearest standard distance (±10% tolerance)
  let matched: { key: DistanceKey; km: number } | null = null
  if (activity.matched_distance_key) {
    matched = STANDARD_DISTANCES.find(d => d.key === activity.matched_distance_key) ?? null
  }
  if (!matched) {
    for (const std of STANDARD_DISTANCES) {
      if (Math.abs(distKm - std.km) / std.km <= 0.10) {
        matched = std
        break
      }
    }
  }

  if (!matched) return null

  const date = activity.start_date.split('T')[0]
  const raceTimeSecs = activity.moving_time

  const raceEstimates: RaceEstimate[] = [
    {
      distanceKey: matched.key,
      estimatedSecs: raceTimeSecs,
      confidence: 0.98,
      source: 'race_result',
      date,
      activityId: activity.id,
      method: `Race result: ${activity.name}`,
      projected: false,
    },
  ]

  // Project to other distances via Riegel with log-distance decay
  for (const std of STANDARD_DISTANCES) {
    if (std.key === matched.key) continue
    const projectedSecs = riegelProject(raceTimeSecs, matched.km, std.km)
    const distRatio = Math.abs(Math.log(std.km / matched.km))
    const confidence = 0.80 * Math.max(0.3, 1 - distRatio * 0.3)
    raceEstimates.push({
      distanceKey: std.key,
      estimatedSecs: projectedSecs,
      confidence,
      source: 'race_result',
      date,
      activityId: activity.id,
      method: `Riegel from ${matched.key} race result`,
      projected: true,
    })
  }

  return {
    date,
    activityId: activity.id,
    activityName: activity.name,
    matchedDistanceKey: matched.key,
    raceTimeSecs,
    raceEstimates,
  }
}
