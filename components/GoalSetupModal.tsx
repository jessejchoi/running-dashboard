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

  const [targetStr,  setTargetStr]  = useState(existing ? formatGoalTime(existing.target_secs)  : '')
  const [currentStr, setCurrentStr] = useState(existing?.current_secs ? formatGoalTime(existing.current_secs) : '')
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
    if (!targetSecs)  { setError('Enter a valid target time (mm:ss or h:mm:ss)'); return }
    if (!currentSecs) { setError('Enter your current estimated time'); return }
    if (!raceDate)    { setError('Pick a race date'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(existing ? `/api/goals/${existing.id}` : '/api/goals', {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_key: distKey,
          label: autoLabel(),
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

  function changeDist(k: DistanceKey) {
    setDistKey(k)
    if (!existing) { setTargetStr(''); setCurrentStr('') }
  }

  const inputClass = "w-full rounded-lg px-3 py-2.5 font-mono text-white text-sm outline-none transition-colors"
  const inputStyle = { background: 'var(--surface-3)', border: '1px solid var(--border)' }

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md z-[9999] shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-display font-bold text-lg">{existing ? 'Edit Goal' : 'Add Race Goal'}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">

          {/* Distance */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest mb-2 block font-mono" style={{ color: 'var(--text-muted)' }}>Distance</label>
            <div className="grid grid-cols-4 gap-2">
              {DISTANCE_OPTIONS.map(d => (
                <button
                  key={d.key}
                  onClick={() => changeDist(d.key as DistanceKey)}
                  className="py-2 rounded-lg text-xs font-bold transition-colors"
                  style={
                    distKey === d.key
                      ? { background: 'var(--orange)', color: 'var(--ink)', border: '1px solid var(--orange)' }
                      : { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target time */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block font-mono" style={{ color: 'var(--text-muted)' }}>Target Time</label>
            <input
              value={targetStr}
              onChange={e => setTargetStr(e.target.value)}
              placeholder={dist.placeholder}
              className={inputClass}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            {targetSecs > 0 && (
              <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-3)' }}>{paceLabel(targetSecs, distKey)} target pace</p>
            )}
          </div>

          {/* Current estimate */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block font-mono" style={{ color: 'var(--text-muted)' }}>
              Current Estimate <span className="normal-case font-normal tracking-normal" style={{ color: 'var(--text-3)' }}>— your best guess is fine</span>
            </label>
            <input
              value={currentStr}
              onChange={e => setCurrentStr(e.target.value)}
              placeholder={dist.placeholder}
              className={inputClass}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            {currentSecs > 0 && (
              <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-3)' }}>{paceLabel(currentSecs, distKey)} current pace</p>
            )}
          </div>

          {/* Race date */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block font-mono" style={{ color: 'var(--text-muted)' }}>Race Date</label>
            <input
              type="date"
              value={raceDate}
              onChange={e => setRaceDate(e.target.value)}
              className={inputClass}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
            style={{ background: 'var(--orange)', color: 'var(--ink)' }}
            onMouseEnter={e => !saving && (e.currentTarget.style.background = 'var(--orange-dim)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--orange)')}
          >
            {saving ? 'Saving…' : existing ? 'Save Changes' : 'Add Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
