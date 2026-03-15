'use client'
import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { useUnit } from '@/lib/unit-context'
import { paceUnitLabel, distanceUnitLabel, metersToMiles, DistanceUnit } from '@/lib/utils'
import { RUN_SESSION_TYPES } from '@/lib/planTypes'

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
  warmupMin: number
  warmupPace: string
  blocks: Block[]
  cooldownMin: number
  cooldownPace: string
}

export interface SummaryPart { text: string; color: string }

interface Props {
  displayDate: string
  initialConfig: SessionConfig | null
  onClose: () => void
  onSave: (config: SessionConfig) => void
  onDelete: () => void
}

function newContinuous(): ContinuousBlock {
  return { id: Math.random().toString(36).slice(2), kind: 'continuous', label: '', mode: 'time', distanceM: 0, durationMin: 0, targetPace: '' }
}
function newInterval(): IntervalBlock {
  return { id: Math.random().toString(36).slice(2), kind: 'interval', reps: 1, mode: 'distance', distanceM: 0, durationMin: 0, targetPace: '', recoveryMode: 'time', recoveryM: 0, recoveryMin: 0, recoveryPace: '' }
}
function defaultConfig(): SessionConfig {
  return { name: '', sessionType: 'easy', warmupMin: 0, warmupPace: '', blocks: [], cooldownMin: 0, cooldownPace: '' }
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
  const wuSec = paceToSec(config.warmupPace)
  if (wuSec > 0) d += (config.warmupMin * 60 / wuSec) * metersPerUnit
  const cdSec = paceToSec(config.cooldownPace)
  if (cdSec > 0) d += (config.cooldownMin * 60 / cdSec) * metersPerUnit
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
  secs += config.warmupMin * 60
  secs += config.cooldownMin * 60
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
  if (config.warmupMin > 0) parts.push({ text: `${config.warmupMin}min WU`, color: 'text-[#facc15]' })
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
      parts.push({ text: b.label ? `${effort} ${b.label}` : effort, color: 'text-[#f97316]' })
    }
  }
  if (config.cooldownMin > 0) parts.push({ text: `${config.cooldownMin}min CD`, color: 'text-[#a78bfa]' })
  return parts
}

export function summarizeSession(config: SessionConfig, unit: DistanceUnit = 'km'): string {
  return summarizeParts(config, unit).map(p => p.text).join(' · ')
}

function Inp({ value, onChange, className = '', type = 'text', placeholder = '' }: {
  value: string | number; onChange: (v: string) => void; className?: string; type?: string; placeholder?: string
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#f97316] transition-colors ${className}`} />
  )
}

function Tog({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${active ? 'bg-[#f97316] text-white' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'}`}>
      {children}
    </button>
  )
}

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return <div className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{children}</div>
}

export default function PlanSessionModal({ displayDate, initialConfig, onClose, onSave, onDelete }: Props) {
  const { unit } = useUnit()
  const [config, setConfig] = useState<SessionConfig>(initialConfig ?? defaultConfig())
  const [confirmDelete, setConfirmDelete] = useState(false)

  function update(c: SessionConfig) {
    setConfig(c)
    onSave(c)
  }

  function addContinuous() { update({ ...config, blocks: [...config.blocks, newContinuous()] }) }
  function addInterval() { update({ ...config, blocks: [...config.blocks, newInterval()] }) }
  function removeBlock(id: string) { update({ ...config, blocks: config.blocks.filter(b => b.id !== id) }) }
  function updateBlock(id: string, patch: Partial<Block>) {
    update({ ...config, blocks: config.blocks.map(b => b.id === id ? { ...b, ...patch } as Block : b) })
  }

  const totalMeters = calcDist(config, unit)
  const totalSecs = calcDuration(config, unit)
  const unitLabel = distanceUnitLabel(unit)
  const paceLabel = paceUnitLabel(unit)
  const estDist = unit === 'miles'
    ? `${metersToMiles(totalMeters).toFixed(2)} ${unitLabel}`
    : `${(totalMeters / 1000).toFixed(2)} ${unitLabel}`
  const isExisting = initialConfig !== null

  function warmupDistPreview() {
    const sec = paceToSec(config.warmupPace)
    if (sec <= 0 || config.warmupMin <= 0) return null
    const metersPerUnit = unit === 'miles' ? 1609.344 : 1000
    const dist = (config.warmupMin * 60 / sec) * metersPerUnit
    return unit === 'miles' ? `${metersToMiles(dist).toFixed(2)} ${unitLabel}` : `${(dist / 1000).toFixed(2)} ${unitLabel}`
  }

  function cooldownDistPreview() {
    const sec = paceToSec(config.cooldownPace)
    if (sec <= 0 || config.cooldownMin <= 0) return null
    const metersPerUnit = unit === 'miles' ? 1609.344 : 1000
    const dist = (config.cooldownMin * 60 / sec) * metersPerUnit
    return unit === 'miles' ? `${metersToMiles(dist).toFixed(2)} ${unitLabel}` : `${(dist / 1000).toFixed(2)} ${unitLabel}`
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
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-[#111] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[9999] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-[#1c1c1c] px-5 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[#6b7280] text-xs mb-0.5">{displayDate}</div>
            <h2 className="font-display font-bold text-lg text-white leading-tight">
              {config.name || <span className="text-[#4b5563]">Untitled run</span>}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isExisting && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-[#6b7280] hover:text-red-400 transition-colors p-1"
              >
                <Trash2 size={16} />
              </button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6b7280]">Delete?</span>
                <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 font-medium">Yes</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#6b7280] hover:text-white">No</button>
              </div>
            )}
            <button onClick={onClose} className="text-[#6b7280] hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Session type */}
          <div className="space-y-2">
            <SectionLabel color="text-[#6b7280]">Session Type</SectionLabel>
            <select
              value={config.sessionType}
              onChange={e => update({ ...config, sessionType: e.target.value })}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f97316] transition-colors appearance-none"
            >
              {RUN_SESSION_TYPES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Session name */}
          <div className="space-y-2">
            <SectionLabel color="text-[#f97316]">Session Name</SectionLabel>
            <input
              type="text"
              value={config.name}
              onChange={e => update({ ...config, name: e.target.value })}
              placeholder="e.g. 6×4min Intervals, Long Run, Recovery..."
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:border-[#f97316] transition-colors"
            />
          </div>

          {/* Warmup */}
          <div className="space-y-2">
            <SectionLabel color="text-[#facc15]">Warmup</SectionLabel>
            <div className="flex items-center gap-2 flex-wrap">
              <Inp value={config.warmupMin} onChange={v => update({ ...config, warmupMin: parseFloat(v) || 0 })} className="w-14" type="number" />
              <span className="text-[#6b7280] text-xs">min</span>
              <Inp value={config.warmupPace} onChange={v => update({ ...config, warmupPace: v })} className="w-16" placeholder="mm:ss" />
              <span className="text-[#6b7280] text-xs">{paceLabel}</span>
              {warmupDistPreview() && (
                <span className="text-[#4b5563] text-xs font-mono">≈ {warmupDistPreview()}</span>
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
                    <span className="text-[#4b5563] text-[10px]">Block {bi + 1}</span>
                  </div>
                  <button onClick={() => removeBlock(b.id)} className="text-[#4b5563] hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                </div>

                {b.kind === 'continuous' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Inp value={b.label} onChange={v => updateBlock(b.id, { label: v })} className="w-28" placeholder="Label (e.g. Tempo)" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-1">
                        <Tog active={b.mode === 'time'} onClick={() => updateBlock(b.id, { mode: 'time' })}>Time</Tog>
                        <Tog active={b.mode === 'distance'} onClick={() => updateBlock(b.id, { mode: 'distance' })}>Distance</Tog>
                      </div>
                      {b.mode === 'time' ? (
                        <><Inp value={b.durationMin} onChange={v => updateBlock(b.id, { durationMin: parseFloat(v) || 0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      ) : (
                        <><Inp value={b.distanceM} onChange={v => updateBlock(b.id, { distanceM: parseInt(v) || 0 })} className="w-20" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                      )}
                      <Inp value={b.targetPace} onChange={v => updateBlock(b.id, { targetPace: v })} className="w-16" placeholder="mm:ss" />
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
                        <Inp value={b.reps} onChange={v => updateBlock(b.id, { reps: parseInt(v) || 1 })} className="w-12" type="number" />
                        <span className="text-[#6b7280] text-xs">×</span>
                      </div>
                      <div className="flex gap-1">
                        <Tog active={b.mode === 'distance'} onClick={() => updateBlock(b.id, { mode: 'distance' })}>Distance</Tog>
                        <Tog active={b.mode === 'time'} onClick={() => updateBlock(b.id, { mode: 'time' })}>Time</Tog>
                      </div>
                      {b.mode === 'distance'
                        ? <><Inp value={b.distanceM} onChange={v => updateBlock(b.id, { distanceM: parseInt(v) || 0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                        : <><Inp value={b.durationMin} onChange={v => updateBlock(b.id, { durationMin: parseFloat(v) || 0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      }
                      <Inp value={b.targetPace} onChange={v => updateBlock(b.id, { targetPace: v })} className="w-16" placeholder="mm:ss" />
                      <span className="text-[#6b7280] text-xs">{paceLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap border-t border-[#222] pt-2">
                      <span className="text-[10px] text-[#60a5fa] font-medium uppercase tracking-wide">Recovery</span>
                      <div className="flex gap-1">
                        <Tog active={b.recoveryMode === 'time'} onClick={() => updateBlock(b.id, { recoveryMode: 'time' })}>Time</Tog>
                        <Tog active={b.recoveryMode === 'distance'} onClick={() => updateBlock(b.id, { recoveryMode: 'distance' })}>Dist</Tog>
                      </div>
                      {b.recoveryMode === 'distance'
                        ? <><Inp value={b.recoveryM} onChange={v => updateBlock(b.id, { recoveryM: parseInt(v) || 0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                        : <><Inp value={b.recoveryMin} onChange={v => updateBlock(b.id, { recoveryMin: parseFloat(v) || 0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      }
                      <Inp value={b.recoveryPace} onChange={v => updateBlock(b.id, { recoveryPace: v })} className="w-16" placeholder="mm:ss" />
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
              <Inp value={config.cooldownMin} onChange={v => update({ ...config, cooldownMin: parseFloat(v) || 0 })} className="w-14" type="number" />
              <span className="text-[#6b7280] text-xs">min</span>
              <Inp value={config.cooldownPace} onChange={v => update({ ...config, cooldownPace: v })} className="w-16" placeholder="mm:ss" />
              <span className="text-[#6b7280] text-xs">{paceLabel}</span>
              {cooldownDistPreview() && (
                <span className="text-[#4b5563] text-xs font-mono">≈ {cooldownDistPreview()}</span>
              )}
            </div>
          </div>

          {/* Estimated total */}
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-[#6b7280]">Estimated</span>
            <div className="flex items-center gap-3">
              <span className="font-display font-bold text-[#f97316] text-2xl">{estDist}</span>
              <span className="text-[#6b7280] text-sm">·</span>
              <span className="font-mono text-white text-sm">{formatSessionTime(totalSecs)}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
