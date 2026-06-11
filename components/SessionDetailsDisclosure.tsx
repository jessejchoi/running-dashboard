'use client'

import { useState, type ReactNode } from 'react'

/**
 * Collapsible wrapper around the legacy per-session breakdown grid on
 * /analysis. Children render server-side as usual; visibility is toggled
 * client-side, so SSR HTML is still complete (good for SEO / refresh).
 *
 * Hidden by default — the feature panels above are the headline. The session
 * detail is power-user territory.
 */
export default function SessionDetailsDisclosure({
  children,
  count,
}: {
  children: ReactNode
  /** Optional running-count to put on the toggle button label. */
  count?: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-10">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-baseline gap-2 text-sm text-[#a1a1aa] hover:text-white transition-colors"
      >
        <span className="font-mono text-xs">{open ? '▼' : '▶'}</span>
        <span className="font-display font-bold uppercase tracking-widest">Session details</span>
        {typeof count === 'number' && (
          <span className="font-mono text-xs text-[#6b7280]">({count})</span>
        )}
      </button>
      <div hidden={!open} className="mt-6">
        {children}
      </div>
    </div>
  )
}
