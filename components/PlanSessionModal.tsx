'use client'
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface RepBlock {
  id: string
  reps: number
  mode: 'distance' | 'time'
  distanceM: number
  durationMin: number
  targetPace: string        // 'mm:ss'
  recoveryMode: 'distance' | 'time'
  recoveryM: number
  recoveryMin: number
  recoveryPace: string
}

interface SessionConfig {
  warmupMin: number
  warmupPace: string
  blocks: RepBlock[]
  cooldownMin: number
  cooldownPace: string
}

interface Session {
  label: string
  sub?: string
  highlight?: boolean
}

interface Props {
  session: Session
  weekNum: number
  dayIdx: number
  onClose: () => void
}

function newBlock(): RepBlock {
  return {
    id: Math.random().toString(36).slice(2),
    reps: 4, mode: 'distance', distanceM: 400, durationMin: 1,
    targetPace: '4:30',
    recoveryMode: 'time', recoveryM: 200, recoveryMin: 1.5,
    recoveryPace: '6:30',
  }
}

function defaultConfig(): SessionConfig {
  return {
    warmupMin: 10, warmupPace: '6:00',
    blocks: [newBlock()],
    cooldownMin: 10, cooldownPace: '6:30',
  }
}

function paceToSec(p: string): number {
  const parts = p.split(':').map(Number)
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0
  return parts[0] * 60 + parts[1]
}

function calcDist(config: SessionConfig): number {
  let d = 0
  const wuSec = paceToSec(config.warmupPace)
  if (wuSec > 0) d += (config.warmupMin * 60 / wuSec) * 1000
  const cdSec = paceToSec(config.cooldownPace)
  if (cdSec > 0) d += (config.cooldownMin * 60 / cdSec) * 1000

  for (const b of config.blocks) {
    const intSec = paceToSec(b.targetPace)
    const recSec = paceToSec(b.recoveryPace)
    let repDist = 0
    if (b.mode === 'distance') {
      repDist = b.distanceM
    } else if (intSec > 0) {
      repDist = (b.durationMin * 60 / intSec) * 1000
    }
    let recDist = 0
    if (b.recoveryMode === 'distance') {
      recDist = b.recoveryM
    } else if (recSec > 0) {
      recDist = (b.recoveryMin * 60 / recSec) * 1000
    }
    d += b.reps * (repDist + recDist)
  }
  return d
}

function Input({ value, onChange, className = '', type = 'text', placeholder = '' }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#f97316] transition-colors ${className}`}
    />
  )
}

function ToggleBtn({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${
        active ? 'bg-[#f97316] text-white' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'
      }`}
    >{children}</button>
  )
}

export default function PlanSessionModal({ session, weekNum, dayIdx, onClose }: Props) {
  const storageKey = `plan_session_w${weekNum}_d${dayIdx}`
  const [config, setConfig] = useState<SessionConfig>(defaultConfig)

  // Load saved config
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setConfig(JSON.parse(saved))
    } catch {}
  }, [storageKey])

  function save(c: SessionConfig) {
    setConfig(c)
    try { localStorage.setItem(storageKey, JSON.stringify(c)) } catch {}
  }

  function updateBlock(id: string, patch: Partial<RepBlock>) {
    save({ ...config, blocks: config.blocks.map(b => b.id === id ? { ...b, ...patch } : b) })
  }

  function addBlock() { save({ ...config, blocks: [...config.blocks, newBlock()] }) }
  function removeBlock(id: string) { save({ ...config, blocks: config.blocks.filter(b => b.id !== id) }) }

  const estDistM = calcDist(config)
  const estDistKm = (estDistM / 1000).toFixed(2)

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-[#111] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[9999] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-[#1c1c1c] px-5 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="font-display font-bold text-lg text-white">{session.label}</h2>
            {session.sub && <p className="text-[#6b7280] text-xs mt-0.5">{session.sub}</p>}
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Warmup */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-[#facc15] uppercase tracking-widest">Warmup</div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Input value={config.warmupMin} onChange={(v: string) => save({ ...config, warmupMin: parseFloat(v) || 0 })} className="w-14" type="number" placeholder="min" />
                <span className="text-[#6b7280] text-xs">min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input value={config.warmupPace} onChange={(v: string) => save({ ...config, warmupPace: v })} className="w-16" placeholder="mm:ss" />
                <span className="text-[#6b7280] text-xs">/km</span>
              </div>
              {paceToSec(config.warmupPace) > 0 && config.warmupMin > 0 && (
                <span className="text-[#4b5563] text-xs font-mono">
                  ≈ {((config.warmupMin * 60 / paceToSec(config.warmupPace)) * 1000 / 1000).toFixed(2)} km
                </span>
              )}
            </div>
          </div>

          {/* Interval blocks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-[#f87171] uppercase tracking-widest">Intervals</div>
              <button onClick={addBlock} className="flex items-center gap-1 text-[10px] text-[#f97316] hover:text-white transition-colors">
                <Plus size={10} /> Add block
              </button>
            </div>

            {config.blocks.map((b, bi) => (
              <div key={b.id} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Block {bi + 1}</span>
                  {config.blocks.length > 1 && (
                    <button onClick={() => removeBlock(b.id)} className="text-[#4b5563] hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Reps + mode */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Input value={b.reps} onChange={(v: string) => updateBlock(b.id, { reps: parseInt(v) || 1 })} className="w-12" type="number" />
                    <span className="text-[#6b7280] text-xs">×</span>
                  </div>
                  <div className="flex gap-1">
                    <ToggleBtn active={b.mode === 'distance'} onClick={() => updateBlock(b.id, { mode: 'distance' })}>Distance</ToggleBtn>
                    <ToggleBtn active={b.mode === 'time'} onClick={() => updateBlock(b.id, { mode: 'time' })}>Time</ToggleBtn>
                  </div>
                  {b.mode === 'distance' ? (
                    <div className="flex items-center gap-1.5">
                      <Input value={b.distanceM} onChange={(v: string) => updateBlock(b.id, { distanceM: parseInt(v) || 0 })} className="w-16" type="number" placeholder="m" />
                      <span className="text-[#6b7280] text-xs">m</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Input value={b.durationMin} onChange={(v: string) => updateBlock(b.id, { durationMin: parseFloat(v) || 0 })} className="w-16" type="number" placeholder="min" />
                      <span className="text-[#6b7280] text-xs">min</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Input value={b.targetPace} onChange={(v: string) => updateBlock(b.id, { targetPace: v })} className="w-16" placeholder="mm:ss" />
                    <span className="text-[#6b7280] text-xs">/km</span>
                  </div>
                </div>

                {/* Recovery */}
                <div className="flex items-center gap-3 flex-wrap border-t border-[#222] pt-2">
                  <span className="text-[10px] text-[#60a5fa] font-medium uppercase tracking-wide">Recovery</span>
                  <div className="flex gap-1">
                    <ToggleBtn active={b.recoveryMode === 'distance'} onClick={() => updateBlock(b.id, { recoveryMode: 'distance' })}>Dist</ToggleBtn>
                    <ToggleBtn active={b.recoveryMode === 'time'} onClick={() => updateBlock(b.id, { recoveryMode: 'time' })}>Time</ToggleBtn>
                  </div>
                  {b.recoveryMode === 'distance' ? (
                    <div className="flex items-center gap-1.5">
                      <Input value={b.recoveryM} onChange={(v: string) => updateBlock(b.id, { recoveryM: parseInt(v) || 0 })} className="w-16" type="number" />
                      <span className="text-[#6b7280] text-xs">m</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Input value={b.recoveryMin} onChange={(v: string) => updateBlock(b.id, { recoveryMin: parseFloat(v) || 0 })} className="w-16" type="number" />
                      <span className="text-[#6b7280] text-xs">min</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Input value={b.recoveryPace} onChange={(v: string) => updateBlock(b.id, { recoveryPace: v })} className="w-16" placeholder="mm:ss" />
                    <span className="text-[#6b7280] text-xs">/km</span>
                  </div>
                </div>

                {/* Block summary */}
                {b.reps > 0 && (
                  <div className="text-[10px] text-[#4b5563] font-mono">
                    {b.reps}×{b.mode === 'distance' ? `${b.distanceM}m` : `${b.durationMin}min`} @ {b.targetPace}/km
                    {' + '}
                    {b.recoveryMode === 'distance' ? `${b.recoveryM}m` : `${b.recoveryMin}min`} rec
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Cooldown */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">Cooldown</div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Input value={config.cooldownMin} onChange={(v: string) => save({ ...config, cooldownMin: parseFloat(v) || 0 })} className="w-14" type="number" />
                <span className="text-[#6b7280] text-xs">min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input value={config.cooldownPace} onChange={(v: string) => save({ ...config, cooldownPace: v })} className="w-16" placeholder="mm:ss" />
                <span className="text-[#6b7280] text-xs">/km</span>
              </div>
              {paceToSec(config.cooldownPace) > 0 && config.cooldownMin > 0 && (
                <span className="text-[#4b5563] text-xs font-mono">
                  ≈ {((config.cooldownMin * 60 / paceToSec(config.cooldownPace)) * 1000 / 1000).toFixed(2)} km
                </span>
              )}
            </div>
          </div>

          {/* Estimated total */}
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-[#6b7280]">Estimated distance</span>
            <span className="font-display font-bold text-[#f97316] text-2xl">{estDistKm} <span className="text-sm text-[#6b7280] font-normal">km</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
