'use client'
import { useState } from 'react'

interface Props {
  activityId: number
  excluded: boolean
  autoExcludedReason?: string  // set when run is automatically filtered (treadmill, too short, etc.)
}

export default function ToggleAnalysisButton({ activityId, excluded: initialExcluded, autoExcludedReason }: Props) {
  const [excluded, setExcluded] = useState(initialExcluded)
  const [saving, setSaving] = useState(false)

  // Auto-excluded by analysis logic — show non-interactive badge with reason
  if (autoExcludedReason) {
    return (
      <span
        title={autoExcludedReason}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium border bg-[#1c1c1c] border-[#2a2a2a] text-[#4b5563] cursor-default"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#3a3a3a]" />
        Auto-excluded
      </span>
    )
  }

  async function toggle() {
    setSaving(true)
    const next = !excluded
    const res = await fetch('/api/toggle-analysis', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId, excluded: next }),
    })
    if (res.ok) {
      setExcluded(next)
      window.location.reload()
    }
    setSaving(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={excluded ? 'Excluded from analysis — click to include' : 'Included in analysis — click to exclude'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all disabled:opacity-50 ${
        excluded
          ? 'bg-[#1c1c1c] border-[#2a2a2a] text-[#4b5563] hover:border-[#3a3a3a] hover:text-[#6b7280]'
          : 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400 hover:bg-emerald-400/20'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${excluded ? 'bg-[#3a3a3a]' : 'bg-emerald-400'}`} />
      {saving ? 'Saving…' : excluded ? 'Excluded' : 'In analysis'}
    </button>
  )
}
