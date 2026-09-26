'use client'
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { type UserGoal, formatGoalTime, distanceKm, distanceShortLabel } from '@/lib/goals'
import { localDate } from '@/lib/calendar'
import GoalSetupModal from './GoalSetupModal'
import { paceUnitLabel, type DistanceUnit } from '@/lib/utils'
export default function GoalCard({
  goal,
  currentEstimateSecs,
  estimate,
  trend,
  onUpdate,
  onDelete,
  unit = 'km',
}: {
  estimate?: import('@/lib/analysis/expected').ExpectedEstimate
  trend?: number | null
  goal: UserGoal
  currentEstimateSecs?: number | null
  confidence?: number
  sourceCounts?: Record<string, number>
  onUpdate: (g: UserGoal) => void
  onDelete: (id: string) => void
  unit?: DistanceUnit
}) {
  const [editing, setEditing] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const gap =
    currentEstimateSecs == null ? null : currentEstimateSecs - goal.target_secs
  const days = Math.round(
    (Date.parse(goal.race_date) -
      Date.parse(localDate(new Date(), goal.timezone ?? 'Asia/Jakarta'))) /
      86400000,
  )
  async function action(primary = false) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(
        `/api/goals/${goal.id}`,
        primary
          ? {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'primary' }),
            }
          : { method: 'DELETE' },
      )
      if (!r.ok) throw new Error('Could not save change')
      if (primary) {
        onUpdate({ ...goal, is_primary: true })
      } else onDelete(goal.id)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  const result = goal.result_secs ?? null
  const shownSecs = result ?? currentEstimateSecs ?? null
  const paceMultiplier = unit === 'miles' ? 1.60934 : 1
  const pace = (seconds: number) => formatGoalTime(seconds / distanceKm(goal.distance_key) * paceMultiplier)
  const completed = goal.status === 'completed'
  const archived = goal.status === 'archived'
  const statusText = completed ? 'Completed' : archived ? 'Archived' : gap == null ? 'No estimate yet' : gap <= 0 ? 'Estimate on target' : 'Building toward goal'
  const statusColor = completed || (gap != null && gap <= 0) ? 'text-[var(--success)]' : 'text-[var(--text-3)]'
  const gapColor = gap == null ? 'var(--text-3)' : gap <= 0 ? 'var(--success)' : 'var(--warning)'
  const name = goal.label.replace(/\s+(5k|10k|HM|FM|Half[- ]Marathon|Marathon)$/i, '') || goal.label
  return (
    <div className="cell flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <p className="font-display font-extrabold text-[26px] leading-none tracking-[-0.02em]">{distanceShortLabel(goal.distance_key)}</p>
          <p title={goal.label} className="text-sm font-medium truncate mt-2">{name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] mt-1" style={{ color: 'var(--text-3)' }}>
            {format(new Date(goal.race_date + 'T12:00:00'), 'MMM d, yyyy')} · {completed ? 'Completed' : archived ? 'Archived' : days >= 0 ? `T−${days}d` : 'Awaiting result'}
          </p>
        </div>
        <div className="flex shrink-0 -mr-3 -mt-3">
          <button aria-label={`Edit or record result for ${goal.label}`} title="Edit / record result" onClick={() => setEditing(true)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-1)]"><Pencil size={14} /></button>
          <button aria-label={`Delete ${goal.label}`} title="Delete goal" disabled={busy} onClick={() => { if (confirm(`Delete ${goal.label}?`)) void action() }} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--error)]"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--text-3)' }}>Target</p>
          <p className="stat-num text-base sm:text-lg font-bold">{formatGoalTime(goal.target_secs)}</p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{pace(goal.target_secs)}{paceUnitLabel(unit)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--text-3)' }}>{result != null ? 'Result' : 'Est.'}</p>
          <p className="stat-num text-base sm:text-lg font-bold">{shownSecs != null ? formatGoalTime(shownSecs) : '--:--'}</p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{shownSecs != null ? `${pace(shownSecs)}${paceUnitLabel(unit)}` : '—'}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--text-3)' }}>Gap</p>
          <p className="stat-num text-base sm:text-lg font-bold" style={{ color: gapColor }}>
            {gap == null || result != null ? '—' : `${gap > 0 ? '+' : '−'}${formatGoalTime(Math.abs(gap))}`}
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--rule)] pt-3 mt-auto">
        <div className="flex justify-between gap-3 text-xs">
          <span className={`font-mono ${statusColor}`}>{statusText}</span>
          {goal.is_primary && <span className="font-mono shrink-0 text-[var(--accent)]">Primary</span>}
        </div>
        {!completed && !archived && gap != null && <p className="text-xs text-[var(--text-2)] mt-2">{gap > 0 ? `${formatGoalTime(gap)} from target` : 'Estimate meets target; race result still to come.'}</p>}
        <details className="mt-2">
          <summary className="text-xs text-[var(--text-3)] cursor-pointer min-h-[44px] py-3">{goal.is_primary ? 'Primary race · ' : ''}Details & options</summary>
          {!completed && <div className="text-xs text-[var(--text-2)] space-y-2 mb-3">
            {estimate?.lowSecs != null && estimate.highSecs != null && <p>Estimated range {formatGoalTime(estimate.lowSecs)}–{formatGoalTime(estimate.highSecs)} · {estimate.confidence} confidence</p>}
            <p>{trend == null ? 'Trend will appear when this model has enough history.' : `${formatGoalTime(Math.abs(trend))} ${trend <= 0 ? 'faster' : 'slower'} than the previous month, using the same model.`}</p>
          </div>}
          {(goal.status ?? 'active') === 'active' && <button className="rd-button" disabled={busy || goal.is_primary} onClick={() => action(true)}>{goal.is_primary ? 'Primary race' : 'Make primary'}</button>}
        </details>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
      {editing && <GoalSetupModal existing={goal} onSave={g => { onUpdate(g); setEditing(false) }} onClose={() => setEditing(false)} />}
    </div>
  )
}
