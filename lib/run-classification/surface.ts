export const TREADMILL_ANALYSIS_WEIGHT = 0.5

export interface RunEnvironmentLike {
  run_type?: string | null
  trainer?: boolean | null
  sport_type?: string | null
  raw?: {
    trainer?: boolean | null
    sport_type?: string | null
  } | null
}

export function isTreadmillRun(activity: RunEnvironmentLike | null | undefined): boolean {
  if (!activity) return false
  return Boolean(
    activity.run_type === 'treadmill' ||
    activity.trainer === true ||
    activity.raw?.trainer === true ||
    activity.sport_type === 'VirtualRun' ||
    activity.raw?.sport_type === 'VirtualRun'
  )
}

export function analysisWeightForActivity(activity: RunEnvironmentLike | null | undefined): number {
  return isTreadmillRun(activity) ? TREADMILL_ANALYSIS_WEIGHT : 1
}
