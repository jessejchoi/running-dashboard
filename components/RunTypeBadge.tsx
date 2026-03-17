import { RUN_TYPES, type RunType } from '@/lib/runtypes'

export default function RunTypeBadge({ type }: { type?: string | null }) {
  if (!type) return <span className="text-[#4b5563] text-xs">—</span>
  const c = RUN_TYPES[type as RunType] ?? RUN_TYPES.easy
  return (
    <span className={`font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap ${c.color} ${c.bg}`}>
      {c.label}
    </span>
  )
}
