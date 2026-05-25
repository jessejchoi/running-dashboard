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

// ── PULSE palette mapping ───────────────────────────────────────────────
// Each intensity bucket maps to one Pulse signal:
//   Easy / Recovery → neutral bone (fg-2) — quiet, "no signal"
//   Tempo / Threshold → muted acid — the work zone
//   Intervals → magenta — peak / hard
//   Long → ice blue — steady / informational
//   Race → magenta inverted (filled background) — race day stands apart
//   Treadmill → fg-3 muted
export const RUN_TYPES = {
  recovery:         { label: 'Recovery',            color: 'text-[#8b837c]', bg: 'bg-white/[0.04]', group: 'Easy' },
  easy:             { label: 'Easy',                color: 'text-[#c9c2ba]', bg: 'bg-white/[0.06]', group: 'Easy' },
  easy_strides:     { label: 'Easy + Strides',      color: 'text-[#c9c2ba]', bg: 'bg-white/[0.06]', group: 'Easy' },
  tempo:            { label: 'Tempo',               color: 'text-[#b8d957]', bg: 'bg-[#b8d957]/[0.10]', group: 'Hard' },
  threshold:        { label: 'Threshold',           color: 'text-[#b8d957]', bg: 'bg-[#b8d957]/[0.10]', group: 'Hard' },
  long_easy:        { label: 'Long Run — Easy',     color: 'text-[#6bbfdf]', bg: 'bg-[#6bbfdf]/[0.10]', group: 'Long' },
  long_steady:      { label: 'Long Run — Steady',   color: 'text-[#6bbfdf]', bg: 'bg-[#6bbfdf]/[0.10]', group: 'Long' },
  long_progressive: { label: 'Long Run with Speed', color: 'text-[#6bbfdf]', bg: 'bg-[#6bbfdf]/[0.10]', group: 'Long' },
  intervals:        { label: 'Intervals',           color: 'text-[#e84d85]', bg: 'bg-[#e84d85]/[0.12]', group: 'Interval' },
  treadmill:        { label: 'Treadmill',           color: 'text-[#8b837c]', bg: 'bg-white/[0.04]', group: 'Other' },
  race:             { label: 'Race',                color: 'text-[#0d0d0f]', bg: 'bg-[#e84d85]',    group: 'Other' },
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
