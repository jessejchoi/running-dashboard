'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RUN_TYPES, getTypesByGroup, type RunType } from '@/lib/runtypes'
import { ChevronDown, Check } from 'lucide-react'

interface Props {
  activityId: number
  current?: string | null
  onUpdate?: (newType: RunType | null) => void
}

export default function RunTypeSelector({ activityId, current, onUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(current ?? null)
  const [saving, setSaving] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const groups = getTypesByGroup()
  const currentConfig = selected ? RUN_TYPES[selected as RunType] : null

  useEffect(() => { setMounted(true) }, [])

  // Position dropdown below the button
  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      })
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSelect(type: RunType | null) {
    setSaving(true)
    setOpen(false)
    const res = await fetch('/api/run-type', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId, runType: type }),
    })
    if (res.ok) { setSelected(type); onUpdate?.(type) }
    setSaving(false)
  }

  const dropdown = mounted && open ? createPortal(
    <div
      ref={dropRef}
      style={{ top: dropdownPos.top, left: dropdownPos.left }}
      className="fixed z-[9999] bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl shadow-2xl py-1 min-w-[200px]"
    >
      <button
        onClick={() => handleSelect(null)}
        className="w-full text-left px-3 py-2 text-xs text-[#6b7280] hover:bg-[#242424] flex items-center justify-between"
      >
        <span>Clear</span>
        {!selected && <Check size={10} />}
      </button>
      <div className="border-t border-[#2a2a2a] my-1" />
      {Object.entries(groups).map(([group, types]) => (
        <div key={group}>
          <div className="px-3 py-1 text-[10px] font-bold text-[#4b5563] uppercase tracking-widest">{group}</div>
          {types.map(({ key, label, color, bg }) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[#242424] flex items-center justify-between gap-2 transition-colors"
            >
              <span className={`flex items-center gap-2 ${color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${bg.replace('/10', '')} inline-block`} />
                {label}
              </span>
              {selected === key && <Check size={10} className={color} />}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
          currentConfig
            ? `${currentConfig.color} ${currentConfig.bg} border-transparent`
            : 'text-[#6b7280] bg-[#1c1c1c] border-[#2a2a2a] hover:border-[#3a3a3a]'
        } ${saving ? 'opacity-50' : ''}`}
      >
        {saving ? <span className="animate-pulse">Saving…</span> : (
          <>{currentConfig ? currentConfig.label : 'Set type'}<ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></>
        )}
      </button>
      {dropdown}
    </div>
  )
}
