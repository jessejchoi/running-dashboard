'use client'
import { useState } from 'react'
import { type UserGoal, formatGoalTime, distanceLabel } from '@/lib/goals'
import { localDate } from '@/lib/calendar'
import GoalSetupModal from './GoalSetupModal'
import { type DistanceUnit } from '@/lib/utils'
export default function GoalCard({
  goal,
  currentEstimateSecs,
  estimate,
  trend,
  onUpdate,
  onDelete,
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
  return (
    <div className="card space-y-3">
      <div className="flex justify-between gap-3">
        <h3 className="font-display font-bold text-lg">{goal.label}</h3>
        <span className="font-mono text-xs text-[var(--accent)]">
          {distanceLabel(goal.distance_key)}
        </span>
      </div>
      <p className="text-sm text-[var(--text-2)]">
        {goal.race_date} ·{' '}
        {goal.status === 'completed'
          ? 'Completed'
          : goal.status === 'archived'
            ? 'Archived'
            : days >= 0
              ? `${days} days away`
              : 'Awaiting result'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-[var(--text-3)]">Target</p>
          <p className="font-mono text-xl">
            {formatGoalTime(goal.target_secs)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-3)]">
            {goal.result_secs ? 'Actual result' : 'Expected today'}
          </p>
          <p className="font-mono text-xl">
            {goal.result_secs
              ? formatGoalTime(goal.result_secs)
              : currentEstimateSecs
                ? formatGoalTime(currentEstimateSecs)
                : '—'}
          </p>
        </div>
      </div>
      {gap != null && goal.status !== 'completed' && (
        <p className="text-sm">
          {gap > 0
            ? `${formatGoalTime(gap)} from target`
            : 'Current estimate meets target; race result still to come.'}
        </p>
      )}
      {goal.status !== 'completed' && (
        <div className="text-xs text-[var(--text-2)] space-y-1">
          {estimate?.lowSecs != null && estimate.highSecs != null && (
            <p>
              Estimated range {formatGoalTime(estimate.lowSecs)}–
              {formatGoalTime(estimate.highSecs)} · {estimate.confidence}{' '}
              confidence
            </p>
          )}
          <p>
            {trend == null
              ? 'Trend will appear when this model has enough history.'
              : `${formatGoalTime(Math.abs(trend))} ${trend <= 0 ? 'faster' : 'slower'} than the previous month, using the same model.`}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="rd-button" onClick={() => setEditing(true)}>
          Edit / record result
        </button>
        {(goal.status ?? 'active') === 'active' && (
          <button
            className="rd-button"
            disabled={busy || goal.is_primary}
            onClick={() => action(true)}
          >
            {goal.is_primary ? 'Primary race' : 'Make primary'}
          </button>
        )}
        <button
          className="rd-button"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete ${goal.label}?`)) void action()
          }}
        >
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--error)]">
          {error}
        </p>
      )}
      {editing && (
        <GoalSetupModal
          existing={goal}
          onSave={(g) => {
            onUpdate(g)
            setEditing(false)
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
