import { RUN_TYPES, type RunType } from '@/lib/runtypes'

export default function RunTypeBadge({ type }: { type?: string | null }) {
  if (!type) return <span className="text-[#4b5563] text-xs">—</span>
  const c = RUN_TYPES[type as RunType] ?? RUN_TYPES.easy
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${c.color} ${c.bg}`}>
      {c.label}
    </span>
  )
}
