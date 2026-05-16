export interface PaceZones {
  intervalMaxPace: number
  thresholdMaxPace: number
  tempoMaxPace: number
  easyMaxPace: number
  longRunThresholdKm: number
  source: 'race_result' | 'user_goal' | 'training'
  confidence?: 'low' | 'medium' | 'high'
  sampleSize?: number
  easySampleSize?: number
  tempoSampleSize?: number
  thresholdSampleSize?: number
  intervalSampleSize?: number
  generatedAt?: string
  reason?: string
  easyAnchorPace?: number
  tempoAnchorPace?: number
  thresholdAnchorPace?: number
  intervalAnchorPace?: number
  hrReliability?: 'known' | 'estimated' | 'missing'
  effectiveMaxHr?: number
  estimatedMaxHr?: number
  easyActivityCount?: number
  hardActivityCount?: number
  uniqueActivityCount?: number
  medianWeeklyLongestRunKm?: number
  p75RunDistanceKm?: number
  longRunThresholdReason?: string
  derivedAnchors?: string[]
  qualityWarnings?: string[]
}

export interface Segment {
  average_speed?: number
  moving_time?: number
  elapsed_time?: number
  distance?: number
}

export interface ActivityLike {
  distance: number
  average_speed: number
  average_heartrate?: number
  suffer_score?: number
  splits?: Segment[]
  laps?: Segment[]
}

// Systematic color palette — one hue per intensity group, consistent saturation
// Easy     → emerald (cool green)
// Hard     → rose → orange
// Long     → sky → cyan → blue
// Interval → red (vivid)
// Other    → zinc
export const RUN_TYPES = {
  recovery:         { label: 'Recovery',             color: 'text-emerald-400', bg: 'bg-emerald-400/15', group: 'Easy' },
  easy:             { label: 'Easy',                 color: 'text-emerald-300', bg: 'bg-emerald-300/15', group: 'Easy' },
  easy_strides:     { label: 'Easy + Strides',       color: 'text-teal-300',    bg: 'bg-teal-300/15',    group: 'Easy' },
  tempo:            { label: 'Tempo',                color: 'text-rose-400',    bg: 'bg-rose-400/15',    group: 'Hard' },
  threshold:        { label: 'Threshold',            color: 'text-orange-400',  bg: 'bg-orange-400/15',  group: 'Hard' },
  long_easy:        { label: 'Long Run — Easy',       color: 'text-sky-400',     bg: 'bg-sky-400/15',     group: 'Long' },
  long_steady:      { label: 'Long Run — Steady',     color: 'text-cyan-400',    bg: 'bg-cyan-400/15',    group: 'Long' },
  long_progressive: { label: 'Long Run with Speed',  color: 'text-blue-400',    bg: 'bg-blue-400/15',    group: 'Long' },
  intervals:        { label: 'Intervals',            color: 'text-red-400',     bg: 'bg-red-400/15',     group: 'Interval' },
  treadmill:        { label: 'Treadmill',            color: 'text-zinc-400',    bg: 'bg-zinc-400/15',    group: 'Other' },
  race:             { label: 'Race',                 color: 'text-amber-400',   bg: 'bg-amber-400/15',   group: 'Other' },
} as const

export type RunType = keyof typeof RUN_TYPES

export const RUN_TYPE_GROUPS = ['Easy', 'Hard', 'Long', 'Interval', 'Other'] as const

export function getTypesByGroup() {
  const groups: Record<string, { key: RunType; label: string; color: string; bg: string }[]> = {}
  for (const [key, val] of Object.entries(RUN_TYPES)) {
    if (!groups[val.group]) groups[val.group] = []
    groups[val.group].push({ key: key as RunType, ...val })
  }
  return groups
}
