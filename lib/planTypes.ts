export interface PlanSessionType {
  key: string
  label: string
  color: string // Tailwind bg-* class
}

export const PLAN_SESSION_TYPES: PlanSessionType[] = [
  { key: 'easy',         label: 'Easy',           color: 'bg-[#b8d957]' },
  { key: 'long_easy',    label: 'Long Easy',      color: 'bg-[#6bbfdf]' },
  { key: 'threshold',    label: 'Threshold',      color: 'bg-[#dc8b3a]' },
  { key: 'interval_5k',  label: 'Intervals',      color: 'bg-[#e84d85]' },
  { key: 'easy_strides', label: 'Easy + Strides', color: 'bg-[#b8d957]' },
  { key: 'recovery',     label: 'Recovery',       color: 'bg-green-400' },
  { key: 'race',         label: 'Race',           color: 'bg-[#e84d85]' },
  { key: 'rest',         label: 'Rest',           color: 'bg-[#202024]' },
]

// All types except 'rest' — used in run editors where rest is a separate action
export const RUN_SESSION_TYPES = PLAN_SESSION_TYPES.filter(s => s.key !== 'rest')
