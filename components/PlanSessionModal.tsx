'use client'
import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'

// A block is either continuous (steady effort) or interval (reps+recovery)
interface ContinuousBlock {
  id: string
  kind: 'continuous'
  label: string        // e.g. "Tempo", "Steady", "MP effort"
  mode: 'distance' | 'time'
  distanceM: number
  durationMin: number
  targetPace: string
}

interface IntervalBlock {
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

type Block = ContinuousBlock | IntervalBlock

interface SessionConfig {
  warmupMin: number
  warmupPace: string
  blocks: Block[]
  cooldownMin: number
  cooldownPace: string
}

interface Session { label: string; sub?: string; highlight?: boolean }
interface Props { session: Session; weekNum: number; dayIdx: number; onClose: () => void }

function newContinuous(): ContinuousBlock {
  return { id: Math.random().toString(36).slice(2), kind: 'continuous', label: 'Steady', mode: 'time', distanceM: 3000, durationMin: 20, targetPace: '5:30' }
}
function newInterval(): IntervalBlock {
  return { id: Math.random().toString(36).slice(2), kind: 'interval', reps: 4, mode: 'distance', distanceM: 400, durationMin: 1, targetPace: '4:30', recoveryMode: 'time', recoveryM: 200, recoveryMin: 1.5, recoveryPace: '6:30' }
}
function defaultConfig(): SessionConfig {
  return { warmupMin: 10, warmupPace: '6:00', blocks: [], cooldownMin: 10, cooldownPace: '6:30' }
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
    if (b.kind === 'continuous') {
      const sec = paceToSec(b.targetPace)
      if (b.mode === 'distance') d += b.distanceM
      else if (sec > 0) d += (b.durationMin * 60 / sec) * 1000
    } else {
      const intSec = paceToSec(b.targetPace)
      const recSec = paceToSec(b.recoveryPace)
      let repDist = b.mode === 'distance' ? b.distanceM : intSec > 0 ? (b.durationMin * 60 / intSec) * 1000 : 0
      let recDist = b.recoveryMode === 'distance' ? b.recoveryM : recSec > 0 ? (b.recoveryMin * 60 / recSec) * 1000 : 0
      d += b.reps * (repDist + recDist)
    }
  }
  return d
}

function Inp({ value, onChange, className = '', type = 'text', placeholder = '' }: any) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#f97316] transition-colors ${className}`} />
  )
}
function Tog({ active, onClick, children }: any) {
  return (
    <button onClick={onClick} className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${active ? 'bg-[#f97316] text-white' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'}`}>
      {children}
    </button>
  )
}

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return <div className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{children}</div>
}

export default function PlanSessionModal({ session, weekNum, dayIdx, onClose }: Props) {
  const storageKey = `plan_session_w${weekNum}_d${dayIdx}`
  const [config, setConfig] = useState<SessionConfig>(defaultConfig)

  useEffect(() => {
    try { const s = localStorage.getItem(storageKey); if (s) setConfig(JSON.parse(s)) } catch {}
  }, [storageKey])

  function save(c: SessionConfig) {
    setConfig(c)
    try { localStorage.setItem(storageKey, JSON.stringify(c)) } catch {}
  }

  function addContinuous() { save({ ...config, blocks: [...config.blocks, newContinuous()] }) }
  function addInterval()   { save({ ...config, blocks: [...config.blocks, newInterval()] }) }
  function removeBlock(id: string) { save({ ...config, blocks: config.blocks.filter(b => b.id !== id) }) }
  function updateBlock(id: string, patch: Partial<Block>) {
    save({ ...config, blocks: config.blocks.map(b => b.id === id ? { ...b, ...patch } as Block : b) })
  }

  const estKm = (calcDist(config) / 1000).toFixed(2)

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#111] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[9999] shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-[#1c1c1c] px-5 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="font-display font-bold text-lg text-white">{session.label}</h2>
            {session.sub && <p className="text-[#6b7280] text-xs mt-0.5">{session.sub}</p>}
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white p-1"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Warmup */}
          <div className="space-y-2">
            <SectionLabel color="text-[#facc15]">Warmup</SectionLabel>
            <div className="flex items-center gap-2 flex-wrap">
              <Inp value={config.warmupMin} onChange={(v: string) => save({ ...config, warmupMin: parseFloat(v)||0 })} className="w-14" type="number" />
              <span className="text-[#6b7280] text-xs">min</span>
              <Inp value={config.warmupPace} onChange={(v: string) => save({ ...config, warmupPace: v })} className="w-16" placeholder="mm:ss" />
              <span className="text-[#6b7280] text-xs">/km</span>
              {paceToSec(config.warmupPace) > 0 && config.warmupMin > 0 && (
                <span className="text-[#4b5563] text-xs font-mono">≈ {((config.warmupMin*60/paceToSec(config.warmupPace))*1000/1000).toFixed(2)} km</span>
              )}
            </div>
          </div>

          {/* Middle blocks */}
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
                  /* ── CONTINUOUS BLOCK ─────────────────────────────────── */
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Inp value={b.label} onChange={(v: string) => updateBlock(b.id, { label: v })} className="w-28" placeholder="Label (e.g. Tempo)" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-1">
                        <Tog active={b.mode==='time'} onClick={() => updateBlock(b.id, { mode: 'time' })}>Time</Tog>
                        <Tog active={b.mode==='distance'} onClick={() => updateBlock(b.id, { mode: 'distance' })}>Distance</Tog>
                      </div>
                      {b.mode === 'time' ? (
                        <><Inp value={b.durationMin} onChange={(v: string) => updateBlock(b.id, { durationMin: parseFloat(v)||0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      ) : (
                        <><Inp value={b.distanceM} onChange={(v: string) => updateBlock(b.id, { distanceM: parseInt(v)||0 })} className="w-20" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                      )}
                      <Inp value={b.targetPace} onChange={(v: string) => updateBlock(b.id, { targetPace: v })} className="w-16" placeholder="mm:ss" />
                      <span className="text-[#6b7280] text-xs">/km</span>
                    </div>
                    {paceToSec(b.targetPace) > 0 && (
                      <div className="text-[10px] text-[#4b5563] font-mono">
                        {b.mode === 'time'
                          ? `≈ ${((b.durationMin*60/paceToSec(b.targetPace))*1000/1000).toFixed(2)} km`
                          : `≈ ${(b.distanceM/1000).toFixed(2)} km · ${Math.floor(b.distanceM/1000*paceToSec(b.targetPace)/60)}:${String(Math.round(b.distanceM/1000*paceToSec(b.targetPace)%60)).padStart(2,'0')} min`}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── INTERVAL BLOCK ───────────────────────────────────── */
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Inp value={b.reps} onChange={(v: string) => updateBlock(b.id, { reps: parseInt(v)||1 })} className="w-12" type="number" />
                        <span className="text-[#6b7280] text-xs">×</span>
                      </div>
                      <div className="flex gap-1">
                        <Tog active={b.mode==='distance'} onClick={() => updateBlock(b.id, { mode: 'distance' })}>Distance</Tog>
                        <Tog active={b.mode==='time'} onClick={() => updateBlock(b.id, { mode: 'time' })}>Time</Tog>
                      </div>
                      {b.mode==='distance'
                        ? <><Inp value={b.distanceM} onChange={(v: string) => updateBlock(b.id, { distanceM: parseInt(v)||0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                        : <><Inp value={b.durationMin} onChange={(v: string) => updateBlock(b.id, { durationMin: parseFloat(v)||0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      }
                      <Inp value={b.targetPace} onChange={(v: string) => updateBlock(b.id, { targetPace: v })} className="w-16" placeholder="mm:ss" />
                      <span className="text-[#6b7280] text-xs">/km</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap border-t border-[#222] pt-2">
                      <span className="text-[10px] text-[#60a5fa] font-medium uppercase tracking-wide">Recovery</span>
                      <div className="flex gap-1">
                        <Tog active={b.recoveryMode==='time'} onClick={() => updateBlock(b.id, { recoveryMode: 'time' })}>Time</Tog>
                        <Tog active={b.recoveryMode==='distance'} onClick={() => updateBlock(b.id, { recoveryMode: 'distance' })}>Dist</Tog>
                      </div>
                      {b.recoveryMode==='distance'
                        ? <><Inp value={b.recoveryM} onChange={(v: string) => updateBlock(b.id, { recoveryM: parseInt(v)||0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">m</span></>
                        : <><Inp value={b.recoveryMin} onChange={(v: string) => updateBlock(b.id, { recoveryMin: parseFloat(v)||0 })} className="w-16" type="number" /><span className="text-[#6b7280] text-xs">min</span></>
                      }
                      <Inp value={b.recoveryPace} onChange={(v: string) => updateBlock(b.id, { recoveryPace: v })} className="w-16" placeholder="mm:ss" />
                      <span className="text-[#6b7280] text-xs">/km</span>
                    </div>
                    <div className="text-[10px] text-[#4b5563] font-mono">
                      {b.reps}×{b.mode==='distance'?`${b.distanceM}m`:`${b.durationMin}min`} @ {b.targetPace}/km + {b.recoveryMode==='distance'?`${b.recoveryM}m`:`${b.recoveryMin}min`} rec
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
              <Inp value={config.cooldownMin} onChange={(v: string) => save({ ...config, cooldownMin: parseFloat(v)||0 })} className="w-14" type="number" />
              <span className="text-[#6b7280] text-xs">min</span>
              <Inp value={config.cooldownPace} onChange={(v: string) => save({ ...config, cooldownPace: v })} className="w-16" placeholder="mm:ss" />
              <span className="text-[#6b7280] text-xs">/km</span>
              {paceToSec(config.cooldownPace) > 0 && config.cooldownMin > 0 && (
                <span className="text-[#4b5563] text-xs font-mono">≈ {((config.cooldownMin*60/paceToSec(config.cooldownPace))*1000/1000).toFixed(2)} km</span>
              )}
            </div>
          </div>

          {/* Estimated total */}
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-[#6b7280]">Estimated distance</span>
            <span className="font-display font-bold text-[#f97316] text-2xl">{estKm} <span className="text-sm text-[#6b7280] font-normal">km</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
