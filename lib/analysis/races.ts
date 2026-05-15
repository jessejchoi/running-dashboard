import { type DistanceKey, type RaceEstimate, type RaceResultAnalysis } from './types'
import { DISTANCE_KM, riegelProject } from './riegel'
import { STANDARD_RACE_DISTANCES, detectRace } from '@/lib/run-classification'

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
  const detection = detectRace(activity)
  if (!detection.isRace || !detection.matchedDistanceKey || !detection.matchedDistanceKm) return null

  const matched = {
    key: detection.matchedDistanceKey,
    km: detection.matchedDistanceKm,
  }

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
  for (const std of STANDARD_RACE_DISTANCES) {
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
