// Systematic color palette — one hue per intensity group, consistent saturation
// Easy     → emerald (cool green)
// Moderate → amber
// Hard     → orange → red
// Long     → sky blue
// Interval → red (vivid)
// Other    → zinc

export const RUN_TYPES = {
  recovery:           { label: 'Recovery',            color: 'text-emerald-400', bg: 'bg-emerald-400/15', group: 'Easy' },
  easy:               { label: 'Easy',                color: 'text-emerald-300', bg: 'bg-emerald-300/15', group: 'Easy' },
  easy_strides:       { label: 'Easy + Strides',      color: 'text-teal-300',    bg: 'bg-teal-300/15',    group: 'Easy' },
  steady:             { label: 'Steady',              color: 'text-amber-400',   bg: 'bg-amber-400/15',   group: 'Moderate' },
  threshold:          { label: 'Threshold',           color: 'text-orange-400',  bg: 'bg-orange-400/15',  group: 'Hard' },
  long_easy:          { label: 'Long — Easy',         color: 'text-sky-400',     bg: 'bg-sky-400/15',     group: 'Long' },
  long_progressive:   { label: 'Long — Progressive',  color: 'text-blue-400',    bg: 'bg-blue-400/15',    group: 'Long' },
  interval_5k:        { label: 'Interval 5K',         color: 'text-red-400',     bg: 'bg-red-400/15',     group: 'Interval' },
  interval_10k:       { label: 'Interval 10K',        color: 'text-red-300',     bg: 'bg-red-300/15',     group: 'Interval' },
  treadmill:          { label: 'Treadmill',           color: 'text-zinc-400',    bg: 'bg-zinc-400/15',    group: 'Other' },
} as const

export type RunType = keyof typeof RUN_TYPES

export const RUN_TYPE_GROUPS = ['Easy', 'Moderate', 'Hard', 'Long', 'Interval', 'Other'] as const

export function getTypesByGroup() {
  const groups: Record<string, { key: RunType; label: string; color: string; bg: string }[]> = {}
  for (const [key, val] of Object.entries(RUN_TYPES)) {
    if (!groups[val.group]) groups[val.group] = []
    groups[val.group].push({ key: key as RunType, ...val })
  }
  return groups
}
