'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { RUN_TYPES, getTypesByGroup, type RunType } from '@/lib/runtypes'
import { ChevronDown, Check } from 'lucide-react'

interface Props {
  activityId: number
  current?: string | null
  isManual?: boolean
  onUpdate?: (newType: RunType | null) => void
}

export default function RunTypeSelector({ activityId, current, isManual, onUpdate }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(current ?? null)
  const [manual, setManual] = useState<boolean>(isManual ?? false)
  const [saving, setSaving] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const groups = getTypesByGroup()
  const currentConfig = selected ? RUN_TYPES[selected as RunType] : null

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    setSelected(current ?? null)
  }, [current])
  useEffect(() => {
    setManual(isManual ?? false)
  }, [isManual])

  // Position dropdown — fixed uses viewport coords, so use rect directly (no scrollY offset)
  function updatePos() {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    // Use actual rendered height if available, otherwise estimate
    const dropH = dropRef.current ? dropRef.current.getBoundingClientRect().height : 360
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow < dropH ? rect.top - dropH - 4 : rect.bottom + 4
    // Clamp so dropdown never overflows viewport bottom
    const clampedTop = Math.min(top, window.innerHeight - dropH - 8)
    // Flip left if would overflow right edge
    const dropW = dropRef.current ? dropRef.current.getBoundingClientRect().width : 200
    const left = rect.left + dropW > window.innerWidth
      ? Math.max(4, window.innerWidth - dropW - 8)
      : rect.left
    setDropdownPos({ top: Math.max(8, clampedTop), left })
  }

  useEffect(() => {
    if (open) {
      // First pass: position with estimate, then re-measure actual size
      updatePos()
      requestAnimationFrame(() => updatePos())
    }
  }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    function handleScroll() { if (open) updatePos() }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  async function handleSelect(type: RunType | null) {
    setSaving(true)
    setOpen(false)
    try {
      const res = await fetch('/api/run-type', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, runType: type }),
      })
      if (res.ok) {
        const payload = await res.json()
        const savedType = (payload.runType ?? null) as RunType | null
        const savedManual = Boolean(payload.isManual)
        setSelected(savedType)
        setManual(savedManual)
        onUpdate?.(savedType)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  const dropdown = mounted && open ? createPortal(
    <div
      ref={dropRef}
      style={{ top: dropdownPos.top, left: dropdownPos.left }}
      className="fixed z-[9999] bg-[#111111] border border-[rgba(255,255,255,0.22)] shadow-2xl py-1 min-w-[220px]"
    >
      <button
        onClick={() => handleSelect(null)}
        className="w-full text-left px-3 py-2 text-xs text-[#6A6A6A] hover:bg-[#232323] flex items-center justify-between uppercase tracking-[0.16em] font-mono"
      >
        <span>Clear</span>
        {!selected && <Check size={10} />}
      </button>
      <div className="border-t border-[rgba(255,255,255,0.10)] my-1" />
      {Object.entries(groups).map(([group, types]) => (
        <div key={group}>
          <div className="px-3 py-1 text-[10px] font-bold text-[#424242] uppercase tracking-widest font-mono">/ {group}</div>
          {types.map(({ key, label, color, bg }) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[#232323] flex items-center justify-between gap-2 transition-colors font-mono uppercase tracking-[0.12em]"
            >
              <span className={`flex items-center gap-2 ${color}`}>
                <span className={`w-1.5 h-1.5 ${bg} inline-block`} />
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
        className={`flex min-h-[32px] items-center gap-2 px-3 py-1.5 border text-[10.5px] font-bold uppercase tracking-[0.16em] transition-all ${
          currentConfig
            ? `${currentConfig.color} ${currentConfig.bg} border-current`
            : 'text-[#6A6A6A] bg-[#232323] border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.22)]'
        } ${saving ? 'opacity-50' : ''}`}
      >
        {saving ? <span className="animate-pulse">Saving</span> : (
          <>
            {currentConfig ? (
              <>
                {currentConfig.label}
                {!manual && <span className="opacity-50 font-normal tracking-[0.12em] ml-1">/ Auto</span>}
              </>
            ) : 'Set type'}
            <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      {dropdown}
    </div>
  )
}
