export interface PlanSessionType {
  key: string
  label: string
  color: string // Tailwind bg-* class
}

export const PLAN_SESSION_TYPES: PlanSessionType[] = [
  { key: 'easy',         label: 'Easy',           color: 'bg-emerald-500' },
  { key: 'long_easy',    label: 'Long Easy',      color: 'bg-sky-500' },
  { key: 'threshold',    label: 'Threshold',      color: 'bg-orange-500' },
  { key: 'interval_5k',  label: 'Intervals',      color: 'bg-red-500' },
  { key: 'easy_strides', label: 'Easy + Strides', color: 'bg-teal-500' },
  { key: 'recovery',     label: 'Recovery',       color: 'bg-green-400' },
  { key: 'race',         label: 'Race',           color: 'bg-pink-500' },
  { key: 'rest',         label: 'Rest',           color: 'bg-zinc-600' },
]

// All types except 'rest' — used in run editors where rest is a separate action
export const RUN_SESSION_TYPES = PLAN_SESSION_TYPES.filter(s => s.key !== 'rest')
