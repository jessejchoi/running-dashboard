import {
  type RaceDetectionActivity,
  type RaceDetectionResult,
  detectRace,
} from './raceDetection'
import { type RunType } from './types'

export interface ResolveRunTypeInput {
  automaticRunType: RunType
  currentRunType?: string | null
  isManual?: boolean
  isTreadmill?: boolean
  raceDetection: RaceDetectionResult
}

export interface PersistedRaceFields {
  is_race: boolean
  matched_distance_key: string | null
}

export function resolvePersistedRunType({
  automaticRunType,
  currentRunType,
  isManual,
  isTreadmill,
  raceDetection,
}: ResolveRunTypeInput): string | null {
  if (isManual) return currentRunType ?? null
  if (isTreadmill) return 'treadmill'
  if (raceDetection.isRace) return 'race'
  return automaticRunType
}

export function raceFieldsForRunType(
  runType: string | null | undefined,
  raceDetection: RaceDetectionResult,
): PersistedRaceFields {
  const isRace = runType === 'race'
  return {
    is_race: isRace,
    matched_distance_key: isRace ? raceDetection.matchedDistanceKey : null,
  }
}

export function detectRaceFieldsForRunType(
  runType: string | null | undefined,
  activity: RaceDetectionActivity,
): PersistedRaceFields {
  return raceFieldsForRunType(runType, detectRace({
    ...activity,
    is_race: runType === 'race',
  }))
}
