'use client'

import { isTreadmillRun, type RunEnvironmentLike } from '@/lib/run-classification/surface'

export default function RunSurfaceBadge({ run }: { run: RunEnvironmentLike }) {
  if (!isTreadmillRun(run)) return null

  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
      style={{
        color: 'var(--text-2)',
        background: 'rgba(161,161,170,0.10)',
        border: '1px solid rgba(161,161,170,0.18)',
      }}
    >
      Treadmill
    </span>
  )
}
