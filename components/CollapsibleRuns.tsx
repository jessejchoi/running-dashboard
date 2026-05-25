'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  count: number
  color: string
  children: React.ReactNode
}

export default function CollapsibleRuns({ count, color, children }: Props) {
  const [open, setOpen] = useState(false)

  if (count === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#303037] bg-[#111] hover:bg-[#161616] transition-colors text-sm"
      >
        <span className="text-[#6b7280]">
          {open ? 'Hide' : 'See all'} <span style={{ color }}>{count} sessions</span>
        </span>
        {open ? <ChevronUp size={14} className="text-[#6b7280]" /> : <ChevronDown size={14} className="text-[#6b7280]" />}
      </button>
      {open && (
        <div className="flex flex-col gap-4 mt-4">
          {children}
        </div>
      )}
    </div>
  )
}
