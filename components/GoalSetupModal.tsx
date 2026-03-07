'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { DISTANCE_OPTIONS, parseTime, formatGoalTime, paceSecs, type UserGoal, type DistanceKey } from '@/lib/goals'

interface Props {
  existing?: UserGoal | null
  onSave: (goal: UserGoal) => void
  onClose: () => void
}

function paceLabel(secs: number, key: DistanceKey) {
  const p = paceSecs(secs, key)
  const m = Math.floor(p / 60)
  const s = Math.round(p % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

export default function GoalSetupModal({ existing, onSave, onClose }: Props) {
  const [distKey, setDistKey] = useState<DistanceKey>(existing?.distance_key ?? '5k')
  const dist = DISTANCE_OPTIONS.find(d => d.key === distKey)!

  const [targetStr,  setTargetStr]  = useState(existing ? formatGoalTime(existing.target_secs)  : dist.defaultTarget)
  const [currentStr, setCurrentStr] = useState(existing?.current_secs ? formatGoalTime(existing.current_secs) : '')
  const [label,      setLabel]      = useState(existing?.label ?? '')
  const [raceDate,   setRaceDate]   = useState(existing?.race_date ?? '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const targetSecs  = parseTime(targetStr)
  const currentSecs = parseTime(currentStr)

  const autoLabel = () => {
    if (targetSecs > 0) {
      const t = formatGoalTime(targetSecs)
      return `Sub ${t} ${dist.label}`
    }
    return dist.label
  }

  async function handleSave() {
    if (!targetSecs) { setError('Enter a valid target time (mm:ss or h:mm:ss)'); return }
    if (!raceDate)   { setError('Pick a race date'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(existing ? `/api/goals/${existing.id}` : '/api/goals', {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_key: distKey,
          label: label.trim() || autoLabel(),
          target_secs: targetSecs,
          current_secs: currentSecs || null,
          race_date: raceDate,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const saved = await res.json()
      onSave(saved)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  // Update defaults when distance changes
  function changeDist(k: DistanceKey) {
    setDistKey(k)
    const d = DISTANCE_OPTIONS.find(x => x.key === k)!
    if (!existing) setTargetStr(d.defaultTarget)
    setLabel('')
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#111] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md z-[9999] shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c1c]">
          <h2 className="font-display font-bold text-lg">{existing ? 'Edit Goal' : 'Add Race Goal'}</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>

        <div className="px-5 py-5 space-y-4">

          {/* Distance */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-2 block">Distance</label>
            <div className="grid grid-cols-4 gap-2">
              {DISTANCE_OPTIONS.map(d => (
                <button key={d.key} onClick={() => changeDist(d.key as DistanceKey)}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors ${distKey === d.key ? 'bg-[#f97316] text-white' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target time */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">Target Time</label>
            <input value={targetStr} onChange={e => setTargetStr(e.target.value)} placeholder={dist.placeholder}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 font-mono text-white text-sm outline-none transition-colors" />
            {targetSecs > 0 && (
              <p className="text-[11px] text-[#4b5563] mt-1 font-mono">{paceLabel(targetSecs, distKey)} target pace</p>
            )}
          </div>

          {/* Current estimate */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">
              Current Estimate <span className="text-[#4b5563] normal-case font-normal tracking-normal">(optional — just a starting point)</span>
            </label>
            <input value={currentStr} onChange={e => setCurrentStr(e.target.value)} placeholder={dist.placeholder}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 font-mono text-white text-sm outline-none transition-colors" />
            {currentSecs > 0 && (
              <p className="text-[11px] text-[#4b5563] mt-1 font-mono">{paceLabel(currentSecs, distKey)} current pace</p>
            )}
          </div>

          {/* Race date */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">Race Date</label>
            <input type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 font-mono text-white text-sm outline-none transition-colors" />
          </div>

          {/* Custom label (optional) */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">
              Goal Name <span className="text-[#4b5563] normal-case font-normal tracking-normal">(optional)</span>
            </label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder={autoLabel()}
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors" />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
            {saving ? 'Saving…' : existing ? 'Save Changes' : 'Add Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
