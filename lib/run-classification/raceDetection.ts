import { type DistanceKey } from '@/lib/goals'

export const RACE_NAME_PATTERN = /\b(race|parkrun|marathon|5k|10k|hm|half.?marathon)\b/i

export const STANDARD_RACE_DISTANCES: { key: DistanceKey; km: number }[] = [
  { key: '5k', km: 5 },
  { key: '10k', km: 10 },
  { key: 'hm', km: 21.097 },
  { key: 'fm', km: 42.195 },
]

export interface RaceDetectionActivity {
  name?: string | null
  distance?: number | null
  is_race?: boolean | null
  matched_distance_key?: string | null
  workout_type?: number | null
  raw?: {
    workout_type?: number | null
  } | null
}

export interface RaceDetectionResult {
  isRace: boolean
  matchedDistanceKey: DistanceKey | null
  matchedDistanceKm: number | null
}

export function isRaceActivity(activity: RaceDetectionActivity): boolean {
  return Boolean(
    activity.is_race ||
    activity.workout_type === 1 ||
    activity.raw?.workout_type === 1 ||
    (activity.name && RACE_NAME_PATTERN.test(activity.name)),
  )
}

export function matchRaceDistance(
  distanceMeters?: number | null,
  explicitDistanceKey?: string | null,
): { key: DistanceKey; km: number } | null {
  if (explicitDistanceKey) {
    const explicit = STANDARD_RACE_DISTANCES.find(d => d.key === explicitDistanceKey)
    if (explicit) return explicit
  }

  if (!distanceMeters || distanceMeters <= 0) return null
  const distanceKm = distanceMeters / 1000

  for (const standard of STANDARD_RACE_DISTANCES) {
    if (Math.abs(distanceKm - standard.km) / standard.km <= 0.10) {
      return standard
    }
  }

  return null
}

export function detectRace(activity: RaceDetectionActivity): RaceDetectionResult {
  const isRace = isRaceActivity(activity)
  const matched = isRace
    ? matchRaceDistance(activity.distance, activity.matched_distance_key)
    : null

  return {
    isRace,
    matchedDistanceKey: matched?.key ?? null,
    matchedDistanceKm: matched?.km ?? null,
  }
}
