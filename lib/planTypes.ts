export interface PlanSessionType {
  key: string
  label: string
  color: string // Tailwind bg-* class
}

export const PLAN_SESSION_TYPES: PlanSessionType[] = [
  { key: 'easy',         label: 'Easy',           color: 'bg-[#d9ff36]' },
  { key: 'long_easy',    label: 'Long Easy',      color: 'bg-[#5ad7ff]' },
  { key: 'threshold',    label: 'Threshold',      color: 'bg-[#ff7a1c]' },
  { key: 'interval_5k',  label: 'Intervals',      color: 'bg-[#ff1d6c]' },
  { key: 'easy_strides', label: 'Easy + Strides', color: 'bg-[#d9ff36]' },
  { key: 'recovery',     label: 'Recovery',       color: 'bg-green-400' },
  { key: 'race',         label: 'Race',           color: 'bg-[#ff1d6c]' },
  { key: 'rest',         label: 'Rest',           color: 'bg-[#1a1a1a]' },
]

// All types except 'rest' — used in run editors where rest is a separate action
export const RUN_SESSION_TYPES = PLAN_SESSION_TYPES.filter(s => s.key !== 'rest')
