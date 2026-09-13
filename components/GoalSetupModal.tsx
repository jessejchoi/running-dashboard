'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  DISTANCE_OPTIONS,
  parseTime,
  formatGoalTime,
  paceSecs,
  type UserGoal,
  type DistanceKey,
} from '@/lib/goals'

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
  const [distKey, setDistKey] = useState<DistanceKey>(
    existing?.distance_key ?? '5k',
  )
  const dist = DISTANCE_OPTIONS.find((d) => d.key === distKey)!

  const [targetStr, setTargetStr] = useState(
    existing ? formatGoalTime(existing.target_secs) : '',
  )
  const [currentStr, setCurrentStr] = useState(
    existing?.current_secs ? formatGoalTime(existing.current_secs) : '',
  )
  const [raceDate, setRaceDate] = useState(existing?.race_date ?? '')
  const [raceName, setRaceName] = useState(existing?.label ?? '')
  const [status, setStatus] = useState(existing?.status ?? 'active')
  const [resultStr, setResultStr] = useState(
    existing?.result_secs ? formatGoalTime(existing.result_secs) : '',
  )
  const [timezone, setTimezone] = useState(existing?.timezone ?? 'Asia/Jakarta')
  const [resultActivity, setResultActivity] = useState(
    existing?.result_activity_id ?? null,
  )
  const [raceRuns, setRaceRuns] = useState<any[]>([])
  useEffect(() => {
    if (!raceDate) return
    let active = true
    fetch(
      `/api/activities?paged=1&from=${raceDate}&to=${raceDate}&timezone=${encodeURIComponent(timezone)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (active) setRaceRuns(d.items ?? [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [raceDate, timezone])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  const targetSecs = parseTime(targetStr)
  const currentSecs = parseTime(currentStr)

  const autoLabel = () => {
    if (targetSecs > 0) {
      const t = formatGoalTime(targetSecs)
      return `Sub ${t} ${dist.label}`
    }
    return dist.label
  }

  async function handleSave() {
    if (!targetSecs) {
      setError('Enter a valid target time (mm:ss or h:mm:ss)')
      return
    }
    if (!raceDate) {
      setError('Pick a race date')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        existing ? `/api/goals/${existing.id}` : '/api/goals',
        {
          method: existing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            distance_key: distKey,
            label: raceName.trim() || autoLabel(),
            status,
            timezone,
            result_activity_id: resultActivity,
            result_secs: parseTime(resultStr) || null,
            target_secs: targetSecs,
            current_secs: currentSecs || null,
            race_date: raceDate,
          }),
        },
      )
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
    if (!existing) {
      setTargetStr('')
      setCurrentStr('')
    }
  }

  const inputClass =
    'w-full rounded-lg px-3 py-2.5 font-mono text-white text-sm outline-none transition-colors'
  const inputStyle = {
    background: 'var(--surface-3)',
    border: '1px solid var(--border)',
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Race goal"
        className="relative rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md z-[9999] shadow-2xl"
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="font-display font-bold text-lg">
            {existing ? 'Edit Goal' : 'Add Race Goal'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close race editor"
            className="p-1 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <label className="block text-sm">
            Race name
            <input
              className="rd-input mt-1"
              value={raceName}
              onChange={(e) => setRaceName(e.target.value)}
              placeholder="Race name (optional)"
            />
          </label>
          {existing && (
            <>
              <label className="block text-sm">
                Status
                <select
                  className="rd-input mt-1"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="active">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="block text-sm">
                Official result
                <input
                  className="rd-input mt-1"
                  value={resultStr}
                  onChange={(e) => setResultStr(e.target.value)}
                  placeholder="mm:ss or h:mm:ss"
                />
              </label>
            </>
          )}
          <label className="block text-sm">
            Race timezone
            <input
              className="rd-input mt-1"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          {existing && (
            <label className="block text-sm">
              Recorded race run (optional)
              <select
                className="rd-input mt-1"
                value={resultActivity ?? ''}
                onChange={(e) =>
                  setResultActivity(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">No linked run</option>
                {raceRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {(r.distance / 1000).toFixed(1)} km
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--text-3)]">
                Link the recording to use your official result as calibration
                evidence.
              </span>
            </label>
          )}
          {/* Distance */}
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest mb-2 block font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              Distance
            </label>
            <div className="grid grid-cols-4 gap-2">
              {DISTANCE_OPTIONS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => changeDist(d.key as DistanceKey)}
                  className="py-2 rounded-lg text-xs font-bold transition-colors"
                  style={
                    distKey === d.key
                      ? {
                          background: 'var(--orange)',
                          color: '#fff',
                          border: '1px solid var(--orange)',
                        }
                      : {
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target time */}
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              Target Time
            </label>
            <input
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value)}
              placeholder={dist.placeholder}
              className={inputClass}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = 'var(--orange)')
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = 'var(--border)')
              }
            />
            {targetSecs > 0 && (
              <p
                className="text-[11px] mt-1 font-mono"
                style={{ color: 'var(--text-3)' }}
              >
                {paceLabel(targetSecs, distKey)} target pace
              </p>
            )}
          </div>

          {/* Current estimate */}
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              Current Estimate{' '}
              <span
                className="normal-case font-normal tracking-normal"
                style={{ color: 'var(--text-3)' }}
              >
                — optional baseline, not a prediction
              </span>
            </label>
            <input
              value={currentStr}
              onChange={(e) => setCurrentStr(e.target.value)}
              placeholder={dist.placeholder}
              className={inputClass}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = 'var(--orange)')
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = 'var(--border)')
              }
            />
            {currentSecs > 0 && (
              <p
                className="text-[11px] mt-1 font-mono"
                style={{ color: 'var(--text-3)' }}
              >
                {paceLabel(currentSecs, distKey)} current pace
              </p>
            )}
          </div>

          {/* Race date */}
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              Race Date
            </label>
            <input
              type="date"
              value={raceDate}
              onChange={(e) => setRaceDate(e.target.value)}
              className={inputClass}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = 'var(--orange)')
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = 'var(--border)')
              }
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--error)' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
            style={{ background: 'var(--orange)' }}
            onMouseEnter={(e) =>
              !saving &&
              (e.currentTarget.style.background = 'var(--orange-dim)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'var(--orange)')
            }
          >
            {saving ? 'Saving…' : existing ? 'Save Changes' : 'Add Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
