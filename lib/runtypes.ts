export const RUN_TYPES = {
  recovery:           { label: 'Recovery',            color: 'text-purple-400',  bg: 'bg-purple-400/10',  group: 'Easy' },
  easy:               { label: 'Easy',                color: 'text-emerald-400', bg: 'bg-emerald-400/10', group: 'Easy' },
  easy_strides:       { label: 'Easy + Strides',      color: 'text-teal-400',    bg: 'bg-teal-400/10',    group: 'Easy' },
  steady:             { label: 'Steady',              color: 'text-yellow-400',  bg: 'bg-yellow-400/10',  group: 'Moderate' },
  threshold:          { label: 'Threshold',           color: 'text-orange-400',  bg: 'bg-orange-400/10',  group: 'Hard' },
  long_easy:          { label: 'Long Run — Easy',     color: 'text-blue-400',    bg: 'bg-blue-400/10',    group: 'Long' },
  long_progressive:   { label: 'Long Run — Prog.',    color: 'text-indigo-400',  bg: 'bg-indigo-400/10',  group: 'Long' },
  interval_5k:        { label: 'Interval 5K',         color: 'text-red-400',     bg: 'bg-red-400/10',     group: 'Interval' },
  interval_10k:       { label: 'Interval 10K',        color: 'text-rose-400',    bg: 'bg-rose-400/10',    group: 'Interval' },
  treadmill:          { label: 'Treadmill',           color: 'text-zinc-400',    bg: 'bg-zinc-400/10',    group: 'Other' },
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
