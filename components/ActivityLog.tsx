'use client'
import { useEffect, useState } from 'react'
import RunRow from './RunRow'
import { type DistanceUnit } from '@/lib/utils'
export default function ActivityLog({
  initial,
  unit,
}: {
  initial: { items: any[]; nextCursor: string | null }
  unit: DistanceUnit
}) {
  const [page, setPage] = useState(initial),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [type, setType] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [history, setHistory] = useState<any>(null),
    [importing, setImporting] = useState(false)
  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {})
  }, [])
  async function load(cursor?: string | null) {
    setBusy(true)
    setError('')
    try {
      const query = new URLSearchParams({
        paged: '1',
        from,
        to,
        run_type: type,
      })
      if (cursor) query.set('cursor', cursor)
      const r = await fetch(`/api/activities?${query}`)
      const body = await r.json()
      if (!r.ok) throw new Error(body.error)
      setPage(body)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function importBatch() {
    setImporting(true)
    setError('')
    try {
      const r = await fetch('/api/history', { method: 'POST' })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error)
      setHistory(body)
    } catch (e) {
      setError(String(e))
    } finally {
      setImporting(false)
    }
  }
  const input =
    'bg-[var(--surface-3)] border border-[var(--border)] rounded-lg p-3 text-sm'
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3">
        <label className="text-xs">
          From (Jakarta)
          <input
            aria-label="From date"
            className={`${input} block mt-1`}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Through (Jakarta)
          <input
            aria-label="Through date"
            className={`${input} block mt-1`}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <select
          aria-label="Run type"
          className={input}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>
          {[
            'easy',
            'recovery',
            'long_easy',
            'threshold',
            'tempo',
            'intervals',
            'race',
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button disabled={busy} className="rd-button" onClick={() => load()}>
          Apply filters
        </button>
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold">Run archive</p>
          <p className="text-sm text-[var(--text-2)]">
            {history?.status === 'complete'
              ? 'All accessible run summaries imported.'
              : `${history?.imported ?? 0} summaries processed · ${history?.status ?? 'Loading status'}`}
          </p>
          {history?.error && (
            <p className="text-xs text-[var(--warning)]">{history.error}</p>
          )}
        </div>
        {history?.status !== 'complete' && (
          <button
            className="rd-button"
            disabled={importing || history?.status === 'reconnect_required'}
            onClick={importBatch}
          >
            {importing
              ? 'Importing a batch…'
              : history?.status === 'not_started'
                ? 'Import older runs'
                : 'Continue import'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[var(--error)]">
          {error}
        </p>
      )}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {['Date', 'Type', 'Distance', 'Pace', 'Time', 'HR', 'Suffer'].map(
                (h) => (
                  <th className="font-mono text-xs p-3 text-left" key={h}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {page.items.map((run) => (
              <RunRow key={run.id} run={run} unit={unit} />
            ))}
          </tbody>
        </table>
        {!page.items.length && (
          <p className="p-6">No runs match these filters.</p>
        )}
      </div>
      <div className="flex justify-between items-center">
        <p className="text-xs text-[var(--text-3)]">Up to 50 runs per page</p>
        <button
          className="rd-button"
          disabled={busy || !page.nextCursor}
          onClick={() => load(page.nextCursor)}
        >
          {busy ? 'Loading…' : 'Older runs →'}
        </button>
      </div>
    </div>
  )
}
