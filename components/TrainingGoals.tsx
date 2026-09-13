'use client'
import { useState } from 'react'
export default function TrainingGoals({ initial }: { initial: any[] }) {
  const [goals, setGoals] = useState(initial),
    [metric, setMetric] = useState('distance'),
    [target, setTarget] = useState(''),
    [timezone, setTimezone] = useState('Asia/Jakarta'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      const r = await fetch('/api/training-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric,
          target: Number(target) * (metric === 'distance' ? 1000 : 1),
          timezone,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      setGoals(data)
      setError('')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card space-y-4">
      <h2 className="font-display font-bold text-xl">Weekly training goals</h2>
      {goals
        .filter((g) => g.active)
        .map((g) => (
          <div key={g.id}>
            <p className="font-mono text-sm">
              {g.metric === 'distance'
                ? `${(g.progress / 1000).toFixed(1)} / ${g.target / 1000} km`
                : `${g.progress} / ${g.target} runs`}{' '}
              · week of {g.week_start}
            </p>
            <progress
              aria-label={g.metric}
              className="w-full accent-[var(--accent)]"
              value={Math.min(g.progress, g.target)}
              max={g.target}
            />
          </div>
        ))}
      <div className="grid sm:grid-cols-3 gap-3">
        <select
          aria-label="Goal metric"
          className="rd-input"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          <option value="distance">Weekly distance (km)</option>
          <option value="runs">Runs per week</option>
        </select>
        <input
          aria-label="Weekly target"
          className="rd-input"
          type="number"
          min="1"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target"
        />
        <input
          aria-label="Training timezone"
          className="rd-input"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </div>
      <button className="rd-button" disabled={busy} onClick={save}>
        Save weekly goal
      </button>
      {error && (
        <p role="alert" className="text-[var(--error)] text-sm">
          {error}
        </p>
      )}
    </section>
  )
}
