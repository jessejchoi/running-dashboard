import { RUN_TYPES, type RunType } from '@/lib/runtypes'

// ── Pulse run-type chip ────────────────────────────────────────────────
// Square, mono, 1px border in the type's hue. Tempo/Intervals/Long get a
// subtle background wash; Race is the only filled chip.
export default function RunTypeBadge({ type }: { type?: string | null }) {
  if (!type) return <span className="text-[#5d5651] text-xs">—</span>
  const c = RUN_TYPES[type as RunType] ?? RUN_TYPES.easy
  return (
    <span
      className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 whitespace-nowrap inline-flex items-center gap-1.5 ${c.color} ${c.bg}`}
      style={{ border: `1px solid currentColor`, borderRadius: 0 }}
    >
      <span style={{ width: 5, height: 5, background: 'currentColor', display: 'inline-block' }} />
      {c.label}
    </span>
  )
}
