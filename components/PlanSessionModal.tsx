'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, ChevronDown, Check } from 'lucide-react'
import { useUnit } from '@/lib/unit-context'
import { paceUnitLabel, distanceUnitLabel, metersToMiles, DistanceUnit } from '@/lib/utils'
import { PLAN_SESSION_TYPES } from '@/lib/planTypes'

export interface ContinuousBlock {
  id: string
  kind: 'continuous'
  label: string
  mode: 'distance' | 'time'
  distanceM: number
  durationMin: number
  targetPace: string
}

export interface IntervalBlock {
  id: string
  kind: 'interval'
  reps: number
  mode: 'distance' | 'time'
  distanceM: number
  durationMin: number
  targetPace: string
  recoveryMode: 'distance' | 'time'
  recoveryM: number
  recoveryMin: number
  recoveryPace: string
}

export type Block = ContinuousBlock | IntervalBlock

export interface SessionConfig {
  name: string
  sessionType: string
  warmupMode: 'distance' | 'time'
  warmupMin: number
  warmupM: number
  warmupPace: string
  blocks: Block[]
  cooldownMode: 'distance' | 'time'
  cooldownMin: number
  cooldownM: number
  cooldownPace: string
}

export interface SummaryPart { text: string; color: string }

interface Props {
  displayDate: string
  initialConfig: SessionConfig | null
  onClose: () => void
  onSave: (config: SessionConfig) => void
  onDelete?: () => void
}

function newContinuous(): ContinuousBlock {
  return { id: Math.random().toString(36).slice(2), kind: 'continuous', label: '', mode: 'time', distanceM: 0, durationMin: 0, targetPace: '' }
}
function newInterval(): IntervalBlock {
  return { id: Math.random().toString(36).slice(2), kind: 'interval', reps: 0, mode: 'distance', distanceM: 0, durationMin: 0, targetPace: '', recoveryMode: 'time', recoveryM: 0, recoveryMin: 0, recoveryPace: '' }
}
export function defaultConfig(): SessionConfig {
  return { name: '', sessionType: 'easy', warmupMode: 'time', warmupMin: 0, warmupM: 0, warmupPace: '', blocks: [], cooldownMode: 'time', cooldownMin: 0, cooldownM: 0, cooldownPace: '' }
}

function SessionTypeDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const current = PLAN_SESSION_TYPES.find(s => s.key === value)

  useEffect(() => { setMounted(true) }, [])

  function updatePos() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const dropH = 320
      const top = window.innerHeight - r.bottom < dropH ? r.top - dropH - 4 : r.bottom + 4
      setPos({ top, left: r.left, width: r.width })
    }
  }

  useEffect(() => { if (open) updatePos() }, [open])

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

  const dropdown = mounted && open ? createPortal(
    <div
      ref={dropRef}
      style={{ top: pos.top, left: pos.left, width: pos.width, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      className="fixed z-[10000] rounded-xl shadow-2xl py-1"
    >
      {PLAN_SESSION_TYPES.map(s => (
        <button
          key={s.key}
          onClick={() => { onChange(s.key); setOpen(false) }}
          className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors"
          style={{ color: value === s.key ? '#fff' : 'var(--text-2)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          <span className={`w-2 h-2 rounded-full ${s.color} shrink-0`} />
          <span className={value === s.key ? 'font-medium' : ''}>{s.label}</span>
          {value === s.key && <Check size={12} className="ml-auto" style={{ color: 'var(--orange)' } as any} />}
        </button>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full transition-colors"
        style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        {current && <span className={`w-2 h-2 rounded-full ${current.color} shrink-0`} />}
        <span className="text-white flex-1 text-left">{current?.label ?? 'Select type'}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
      </button>
      {dropdown}
    </div>
  )
}

function paceToSec(p: string): number {
  const parts = p.split(':').map(Number)
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0
  return parts[0] * 60 + parts[1]
}

function formatSessionTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

export function calcDist(config: SessionConfig, unit: DistanceUnit = 'km'): number {
  const metersPerUnit = unit === 'miles' ? 1609.344 : 1000
  let d = 0
  const warmupMode = config.warmupMode ?? 'time'
  if (warmupMode === 'distance') {
    d += config.warmupM ?? 0
  } else {
    const wuSec = paceToSec(config.warmupPace)
    if (wuSec > 0) d += (config.warmupMin * 60 / wuSec) * metersPerUnit
  }
  const cooldownMode = config.cooldownMode ?? 'time'
  if (cooldownMode === 'distance') {
    d += config.cooldownM ?? 0
  } else {
    const cdSec = paceToSec(config.cooldownPace)
    if (cdSec > 0) d += (config.cooldownMin * 60 / cdSec) * metersPerUnit
  }
  for (const b of config.blocks) {
    if (b.kind === 'continuous') {
      const sec = paceToSec(b.targetPace)
      if (b.mode === 'distance') d += b.distanceM
      else if (sec > 0) d += (b.durationMin * 60 / sec) * metersPerUnit
    } else {
      const intSec = paceToSec(b.targetPace)
      const recSec = paceToSec(b.recoveryPace)
      const repDist = b.mode === 'distance' ? b.distanceM : intSec > 0 ? (b.durationMin * 60 / intSec) * metersPerUnit : 0
      const recDist = b.recoveryMode === 'distance' ? b.recoveryM : recSec > 0 ? (b.recoveryMin * 60 / recSec) * metersPerUnit : 0
      d += b.reps * (repDist + recDist)
    }
  }
  return d
}

export function calcDuration(config: SessionConfig, unit: DistanceUnit = 'km'): number {
  const metersPerUnit = unit === 'miles' ? 1609.344 : 1000
  let secs = 0
  const warmupMode = config.warmupMode ?? 'time'
  if (warmupMode === 'distance') {
    const wuPaceSec = paceToSec(config.warmupPace)
    if (wuPaceSec > 0) secs += ((config.warmupM ?? 0) / metersPerUnit) * wuPaceSec
  } else {
    secs += config.warmupMin * 60
  }
  const cooldownMode = config.cooldownMode ?? 'time'
  if (cooldownMode === 'distance') {
    const cdPaceSec = paceToSec(config.cooldownPace)
    if (cdPaceSec > 0) secs += ((config.cooldownM ?? 0) / metersPerUnit) * cdPaceSec
  } else {
    secs += config.cooldownMin * 60
  }
  for (const b of config.blocks) {
    if (b.kind === 'continuous') {
      if (b.mode === 'time') {
        secs += b.durationMin * 60
      } else {
        const paceSec = paceToSec(b.targetPace)
        if (paceSec > 0) secs += (b.distanceM / metersPerUnit) * paceSec
      }
    } else {
      for (let i = 0; i < b.reps; i++) {
        if (b.mode === 'time') {
          secs += b.durationMin * 60
        } else {
          const paceSec = paceToSec(b.targetPace)
          if (paceSec > 0) secs += (b.distanceM / metersPerUnit) * paceSec
        }
        if (b.recoveryMode === 'time') {
          secs += b.recoveryMin * 60
        } else {
          const recPaceSec = paceToSec(b.recoveryPace)
          if (recPaceSec > 0) secs += (b.recoveryM / metersPerUnit) * recPaceSec
        }
      }
    }
  }
  return secs
}

export function summarizeParts(config: SessionConfig, unit: DistanceUnit = 'km'): SummaryPart[] {
  const parts: SummaryPart[] = []
  const unitLabel = distanceUnitLabel(unit)
  const warmupMode = config.warmupMode ?? 'time'
  if (warmupMode === 'distance' ? (config.warmupM ?? 0) > 0 : config.warmupMin > 0) {
    const wuLabel = warmupMode === 'distance'
      ? (unit === 'miles' ? `${metersToMiles(config.warmupM ?? 0).toFixed(2)}${unitLabel}` : `${((config.warmupM ?? 0) / 1000).toFixed(2)}${unitLabel}`)
      : `${config.warmupMin}min`
    parts.push({ text: `${wuLabel} WU`, color: 'text-[#facc15]' })
  }
  for (const b of config.blocks) {
    if (b.kind === 'interval') {
      const effort = b.mode === 'distance' ? `${b.distanceM}m` : `${b.durationMin}min`
      const paceLabel = b.targetPace ? ` @${b.targetPace}${paceUnitLabel(unit)}` : ''
      parts.push({ text: `${b.reps}×${effort}${paceLabel}`, color: 'text-[#f87171]' })
    } else {
      let effort: string
      if (b.mode === 'distance') {
        const distVal = unit === 'miles' ? metersToMiles(b.distanceM).toFixed(2) : (b.distanceM / 1000).toFixed(1)
        effort = `${distVal}${unitLabel}`
      } else {
        effort = `${b.durationMin}min`
      }
      const paceStr = b.targetPace ? ` @ ${b.targetPace}${paceUnitLabel(unit)}` : ''
      parts.push({ text: `${effort}${b.label ? ` ${b.label}` : ''}${paceStr}`, color: 'text-[#f97316]' })
    }
  }
  const cooldownMode = config.cooldownMode ?? 'time'
  if (cooldownMode === 'distance' ? (config.cooldownM ?? 0) > 0 : config.cooldownMin > 0) {
    const cdLabel = cooldownMode === 'distance'
      ? (unit === 'miles' ? `${metersToMiles(config.cooldownM ?? 0).toFixed(2)}${unitLabel}` : `${((config.cooldownM ?? 0) / 1000).toFixed(2)}${unitLabel}`)
      : `${config.cooldownMin}min`
    parts.push({ text: `${cdLabel} CD`, color: 'text-[#a78bfa]' })
  }
  return parts
}

export function summarizeSession(config: SessionConfig, unit: DistanceUnit = 'km'): string {
  return summarizeParts(config, unit).map(p => p.text).join(' · ')
}

function Inp({ value, onChange, className = '', type = 'text', placeholder = '' }: {
  value: string | number; onChange: (v: string) => void; className?: string; type?: string; placeholder?: string
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (type === 'number') {
      // Strip non-numeric chars (allow decimal point)
      const raw = e.target.value.replace(/[^0-9.]/g, '')
      onChange(raw)
    } else {
      onChange(e.target.value)
    }
  }
  return (
    <input
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className={`rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none transition-colors ${className}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    />
  )
}

function PaceInp({ value, onChange, className = '' }: {
  value: string; onChange: (v: string) => void; className?: string
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
    if (digits.length <= 2) {
      onChange(digits)
    } else {
      const secs = Math.min(59, parseInt(digits.slice(2), 10))
      onChange(digits.slice(0, 2) + ':' + String(secs).padStart(2, '0'))
    }
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      placeholder="mm:ss"
      className={`rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none transition-colors ${className}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    />
  )
}

function Tog({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-[10px] rounded font-medium transition-colors"
      style={active
        ? { background: 'var(--orange)', color: '#fff' }
        : { background: 'var(--surface-2)', color: 'var(--text-muted)' }
      }
    >
      {children}
    </button>
  )
}

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return <div className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{children}</div>
}

function validate(config: SessionConfig): string | null {
  if (config.sessionType === 'rest') return null
  for (let i = 0; i < config.blocks.length; i++) {
    const b = config.blocks[i]
    const n = i + 1
    if (b.kind === 'continuous') {
      if (b.mode === 'distance' && b.distanceM <= 0) return `Block ${n}: enter a distance`
      if (b.mode === 'time' && b.durationMin <= 0) return `Block ${n}: enter a duration`
      if (!b.targetPace) return `Block ${n}: enter a pace`
    } else {
      if (b.reps <= 0) return `Block ${n}: enter number of reps`
      if (b.mode === 'distance' && b.distanceM <= 0) return `Block ${n}: enter a distance`
      if (b.mode === 'time' && b.durationMin <= 0) return `Block ${n}: enter a duration`
      if (!b.targetPace) return `Block ${n}: enter a pace`
    }
  }
  return null
}

export default function PlanSessionModal({ displayDate, initialConfig, onClose, onSave, onDelete }: Props) {
  const { unit } = useUnit()
  const [config, setConfig] = useState<SessionConfig>(initialConfig ?? defaultConfig())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const initialSnapshot = useRef(JSON.stringify(initialConfig ?? defaultConfig()))

  const dirty = JSON.stringify(config) !== initialSnapshot.current

  function update(c: SessionConfig) {
    setConfig(c)
    setValidationError(null)
  }

  function addContinuous() { update({ ...config, blocks: [...config.blocks, newContinuous()] }) }
  function addInterval() { update({ ...config, blocks: [...config.blocks, newInterval()] }) }
  function removeBlock(id: string) { update({ ...config, blocks: config.blocks.filter(b => b.id !== id) }) }
  function updateBlock(id: string, patch: Partial<Block>) {
    update({ ...config, blocks: config.blocks.map(b => b.id === id ? { ...b, ...patch } as Block : b) })
  }

  function handleSave() {
    const err = validate(config)
    if (err) { setValidationError(err); return }
    onSave(config)
    onClose()
  }

  function handleClose() {
    if (dirty) { setConfirmClose(true) } else { onClose() }
  }

  const totalMeters = calcDist(config, unit)
  const totalSecs = calcDuration(config, unit)
  const unitLabel = distanceUnitLabel(unit)
  const paceLabel = paceUnitLabel(unit)
  const estDist = unit === 'miles'
    ? `${metersToMiles(totalMeters).toFixed(2)} ${unitLabel}`
    : `${(totalMeters / 1000).toFixed(2)} ${unitLabel}`
  const isExisting = initialConfig !== null

  function warmupPreview() {
    const paceSec = paceToSec(config.warmupPace)
    const metersPerUnit = unit === 'miles' ? 1609.344 : 1000
    const warmupMode = config.warmupMode ?? 'time'
    if (warmupMode === 'distance') {
      const m = config.warmupM ?? 0
      if (m <= 0 || paceSec <= 0) return null
      const durSecs = (m / metersPerUnit) * paceSec
      const durMin = Math.floor(durSecs / 60)
      const durSec = Math.round(durSecs % 60)
      return `≈ ${durMin}:${String(durSec).padStart(2, '0')} min`
    } else {
      if (paceSec <= 0 || config.warmupMin <= 0) return null
      const dist = (config.warmupMin * 60 / paceSec) * metersPerUnit
      return unit === 'miles' ? `≈ ${metersToMiles(dist).toFixed(2)} ${unitLabel}` : `≈ ${(dist / 1000).toFixed(2)} ${unitLabel}`
    }
  }

  function cooldownPreview() {
    const paceSec = paceToSec(config.cooldownPace)
    const metersPerUnit = unit === 'miles' ? 1609.344 : 1000
    const cooldownMode = config.cooldownMode ?? 'time'
    if (cooldownMode === 'distance') {
      const m = config.cooldownM ?? 0
      if (m <= 0 || paceSec <= 0) return null
      const durSecs = (m / metersPerUnit) * paceSec
      const durMin = Math.floor(durSecs / 60)
      const durSec = Math.round(durSecs % 60)
      return `≈ ${durMin}:${String(durSec).padStart(2, '0')} min`
    } else {
      if (paceSec <= 0 || config.cooldownMin <= 0) return null
      const dist = (config.cooldownMin * 60 / paceSec) * metersPerUnit
      return unit === 'miles' ? `≈ ${metersToMiles(dist).toFixed(2)} ${unitLabel}` : `≈ ${(dist / 1000).toFixed(2)} ${unitLabel}`
    }
  }

  function contBlockPreview(b: ContinuousBlock) {
    const paceSec = paceToSec(b.targetPace)
    if (paceSec <= 0) return null
    const metersPerUnit = unit === 'miles' ? 1609.344 : 1000
    if (b.mode === 'time') {
      const dist = (b.durationMin * 60 / paceSec) * metersPerUnit
      return unit === 'miles' ? `≈ ${metersToMiles(dist).toFixed(2)} ${unitLabel}` : `≈ ${(dist / 1000).toFixed(2)} ${unitLabel}`
    } else {
      const distVal = unit === 'miles' ? `${metersToMiles(b.distanceM).toFixed(2)} ${unitLabel}` : `${(b.distanceM / 1000).toFixed(2)} ${unitLabel}`
      const durSecs = (b.distanceM / metersPerUnit) * paceSec
      const durMin = Math.floor(durSecs / 60)
      const durSec = Math.round(durSecs % 60)
      return `≈ ${distVal} · ${durMin}:${String(durSec).padStart(2, '0')} min`
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[9999] shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 px-5 py-4 flex items-center justify-between z-10" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="text-xs mb-0.5 font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{displayDate}</div>
            <h2 className="font-display font-bold text-lg text-white leading-tight">
              {config.sessionType === 'rest'
                ? <span className="text-[#a78bfa]">Rest Day</span>
                : (config.name || <span className="text-[#4b5563]">Untitled run</span>)
              }
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isExisting && onDelete && !confirmDelete && !confirmClose && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="hover:text-red-400 transition-colors p-1" style={{ color: 'var(--text-muted)' }}
              >
                <Trash2 size={16} />
              </button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Delete?</span>
                <button onClick={() => onDelete?.()} className="text-xs text-red-400 hover:text-red-300 font-medium">Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs hover:text-white transition-colors" style={{ color: 'var(--text-muted)' }}>No</button>
              </div>
            )}
            {confirmClose && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Discard changes?</span>
                <button onClick={onClose} className="text-xs text-red-400 hover:text-red-300 font-medium">Yes</button>
                <button onClick={() => setConfirmClose(false)} className="text-xs hover:text-white transition-colors" style={{ color: 'var(--text-muted)' }}>No</button>
              </div>
            )}
            {!confirmDelete && !confirmClose && (
              <button onClick={handleClose} className="hover:text-white p-1 transition-colors" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            )}
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Session type */}
          <div className="space-y-2">
            <SectionLabel color="text-[#6b7280]">Session Type</SectionLabel>
            <SessionTypeDropdown value={config.sessionType} onChange={v => update({ ...config, sessionType: v })} />
          </div>

          {config.sessionType !== 'rest' && (<>

          {/* Session name */}
          <div className="space-y-2">
            <SectionLabel color="text-[#f97316]">Session Name</SectionLabel>
            <input
              type="text"
              value={config.name}
              onChange={e => update({ ...config, name: e.target.value })}
              placeholder="e.g. 6×4min Intervals, Long Run, Recovery..."
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-[#4b5563] focus:outline-none transition-colors"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Warmup */}
          <div className="space-y-2">
            <SectionLabel color="text-[#facc15]">Warmup</SectionLabel>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1">
                <Tog active={(config.warmupMode ?? 'time') === 'time'} onClick={() => update({ ...config, warmupMode: 'time' })}>Time</Tog>
                <Tog active={(config.warmupMode ?? 'time') === 'distance'} onClick={() => update({ ...config, warmupMode: 'distance' })}>Distance</Tog>
              </div>
              {(config.warmupMode ?? 'time') === 'time' ? (
                <><Inp value={config.warmupMin || ''} onChange={v => update({ ...config, warmupMin: Math.max(0, parseFloat(v) || 0) })} className="w-14" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
              ) : (
                <><Inp value={config.warmupM || ''} onChange={v => update({ ...config, warmupM: Math.max(0, parseInt(v) || 0) })} className="w-20" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
              )}
              <PaceInp value={config.warmupPace} onChange={v => update({ ...config, warmupPace: v })} className="w-16" />
              <span className="text-[#6b7280] text-xs">{paceLabel}</span>
              {warmupPreview() && (
                <span className="text-[#4b5563] text-xs font-mono">{warmupPreview()}</span>
              )}
            </div>
          </div>

          {/* Training Blocks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel color="text-white">Training Blocks</SectionLabel>
              <div className="flex gap-2">
                <button onClick={addContinuous} className="flex items-center gap-1 text-[10px] text-[#f97316] hover:text-white border border-[#f97316]/30 hover:border-[#f97316] rounded px-2 py-1 transition-colors">
                  <Plus size={9} /> Continuous
                </button>
                <button onClick={addInterval} className="flex items-center gap-1 text-[10px] text-[#dc2626] hover:text-white border border-[#dc2626]/30 hover:border-[#dc2626] rounded px-2 py-1 transition-colors">
                  <Plus size={9} /> Intervals
                </button>
              </div>
            </div>

            {config.blocks.length === 0 && (
              <div className="text-[#4b5563] text-xs italic py-2">Add a continuous block for steady efforts, or an interval block for reps.</div>
            )}

            {config.blocks.map((b, bi) => (
              <div key={b.id} className={`border rounded-xl p-3 space-y-3 ${b.kind === 'continuous' ? 'bg-[#161a13] border-[#f97316]/20' : 'bg-[#1a1313] border-[#dc2626]/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${b.kind === 'continuous' ? 'text-[#f97316]' : 'text-[#dc2626]'}`}>
                      {b.kind === 'continuous' ? '⟶ Continuous' : '↺ Intervals'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>Block {bi + 1}</span>
                  </div>
                  <button onClick={() => removeBlock(b.id)} className="text-[#4b5563] hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                </div>

                {b.kind === 'continuous' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-1">
                        <Tog active={b.mode === 'time'} onClick={() => updateBlock(b.id, { mode: 'time' })}>Time</Tog>
                        <Tog active={b.mode === 'distance'} onClick={() => updateBlock(b.id, { mode: 'distance' })}>Distance</Tog>
                      </div>
                      {b.mode === 'time' ? (
                        <><Inp value={b.durationMin || ''} onChange={v => updateBlock(b.id, { durationMin: Math.max(0, parseFloat(v) || 0) })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      ) : (
                        <><Inp value={b.distanceM || ''} onChange={v => updateBlock(b.id, { distanceM: Math.max(0, parseInt(v) || 0) })} className="w-20" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                      )}
                      <PaceInp value={b.targetPace} onChange={v => updateBlock(b.id, { targetPace: v })} className="w-16" />
                      <span className="text-[#6b7280] text-xs">{paceLabel}</span>
                    </div>
                    {contBlockPreview(b) && (
                      <div className="text-[10px] text-[#4b5563] font-mono">{contBlockPreview(b)}</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Inp value={b.reps || ''} onChange={v => updateBlock(b.id, { reps: Math.min(50, Math.max(0, parseInt(v) || 0)) })} className="w-12" type="number" />
                        <span className="text-[#6b7280] text-xs">×</span>
                      </div>
                      <div className="flex gap-1">
                        <Tog active={b.mode === 'distance'} onClick={() => updateBlock(b.id, { mode: 'distance' })}>Distance</Tog>
                        <Tog active={b.mode === 'time'} onClick={() => updateBlock(b.id, { mode: 'time' })}>Time</Tog>
                      </div>
                      {b.mode === 'distance'
                        ? <><Inp value={b.distanceM || ''} onChange={v => updateBlock(b.id, { distanceM: Math.max(0, parseInt(v) || 0) })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                        : <><Inp value={b.durationMin || ''} onChange={v => updateBlock(b.id, { durationMin: Math.max(0, parseFloat(v) || 0) })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      }
                      <PaceInp value={b.targetPace} onChange={v => updateBlock(b.id, { targetPace: v })} className="w-16" />
                      <span className="text-[#6b7280] text-xs">{paceLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap border-t border-[#222] pt-2">
                      <span className="text-[10px] text-[#60a5fa] font-medium uppercase tracking-wide">Recovery</span>
                      <div className="flex gap-1">
                        <Tog active={b.recoveryMode === 'time'} onClick={() => updateBlock(b.id, { recoveryMode: 'time' })}>Time</Tog>
                        <Tog active={b.recoveryMode === 'distance'} onClick={() => updateBlock(b.id, { recoveryMode: 'distance' })}>Dist</Tog>
                      </div>
                      {b.recoveryMode === 'distance'
                        ? <><Inp value={b.recoveryM || ''} onChange={v => updateBlock(b.id, { recoveryM: Math.max(0, parseInt(v) || 0) })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                        : <><Inp value={b.recoveryMin || ''} onChange={v => updateBlock(b.id, { recoveryMin: Math.max(0, parseFloat(v) || 0) })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      }
                      <PaceInp value={b.recoveryPace} onChange={v => updateBlock(b.id, { recoveryPace: v })} className="w-16" />
                      <span className="text-[#6b7280] text-xs">{paceLabel}</span>
                    </div>
                    <div className="text-[10px] text-[#4b5563] font-mono">
                      {b.reps}×{b.mode === 'distance' ? `${b.distanceM}m` : `${b.durationMin}min`} @ {b.targetPace}{paceLabel} + {b.recoveryMode === 'distance' ? `${b.recoveryM}m` : `${b.recoveryMin}min`} rec
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Cooldown */}
          <div className="space-y-2">
            <SectionLabel color="text-[#a78bfa]">Cooldown</SectionLabel>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1">
                <Tog active={(config.cooldownMode ?? 'time') === 'time'} onClick={() => update({ ...config, cooldownMode: 'time' })}>Time</Tog>
                <Tog active={(config.cooldownMode ?? 'time') === 'distance'} onClick={() => update({ ...config, cooldownMode: 'distance' })}>Distance</Tog>
              </div>
              {(config.cooldownMode ?? 'time') === 'time' ? (
                <><Inp value={config.cooldownMin || ''} onChange={v => update({ ...config, cooldownMin: Math.max(0, parseFloat(v) || 0) })} className="w-14" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
              ) : (
                <><Inp value={config.cooldownM || ''} onChange={v => update({ ...config, cooldownM: Math.max(0, parseInt(v) || 0) })} className="w-20" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
              )}
              <PaceInp value={config.cooldownPace} onChange={v => update({ ...config, cooldownPace: v })} className="w-16" />
              <span className="text-[#6b7280] text-xs">{paceLabel}</span>
              {cooldownPreview() && (
                <span className="text-[#4b5563] text-xs font-mono">{cooldownPreview()}</span>
              )}
            </div>
          </div>

          {/* Estimated total */}
          <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
            <span className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Estimated</span>
            <div className="flex items-center gap-3">
              <span className="font-display font-bold text-[#f97316] text-2xl">{estDist}</span>
              <span className="text-[#6b7280] text-sm">·</span>
              <span className="font-mono text-white text-sm">{formatSessionTime(totalSecs)}</span>
            </div>
          </div>

          </>)}

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-5 py-3 flex items-center justify-between gap-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <span className="text-xs text-red-400 min-h-[1rem]">{validationError ?? ''}</span>
          <button
            onClick={handleSave}
            className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors shrink-0"
            style={{ background: 'var(--orange)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--orange-dim)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--orange)')}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
