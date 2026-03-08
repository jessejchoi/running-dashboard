'use client'
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import { formatGoalTime, paceSecs, distanceKm, type UserGoal, type DistanceKey } from '@/lib/goals'
import GoalSetupModal from './GoalSetupModal'

interface Props {
  goal: UserGoal
  currentEstimateSecs?: number | null   // from analysis engine
  onUpdate: (goal: UserGoal) => void
  onDelete: (id: string) => void
}

function paceStr(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function GoalCard({ goal, currentEstimateSecs, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const today    = new Date()
  const raceDate = new Date(goal.race_date)
  const daysLeft = differenceInDays(raceDate, today)
  const isPast   = daysLeft < 0

  // Best current pace: prefer analysis engine, fall back to user's manual estimate
  const currentSecs = currentEstimateSecs ?? goal.current_secs ?? null
  const km          = distanceKm(goal.distance_key as DistanceKey)
  const targetPace  = paceSecs(goal.target_secs, goal.distance_key as DistanceKey)
  const currentPace = currentSecs ? currentSecs / km : null

  // Progress bar: 0% = current_secs (starting point), 100% = target_secs
  // Baseline is user's current_secs (or 30s/km slower than target as fallback)
  const baseline = goal.current_secs
    ? goal.current_secs / km
    : targetPace + 30

  let progress = 0
  if (currentPace && baseline > targetPace) {
    progress = Math.min(1, Math.max(0, (baseline - currentPace) / (baseline - targetPace)))
  }

  const status =
    !currentPace   ? 'unknown'
    : progress >= 1     ? 'goal'
    : progress >= 0.5   ? 'close'
    : 'behind'

  const statusColor = { goal: 'text-emerald-400', close: 'text-yellow-400', behind: 'text-orange-400', unknown: 'text-[#6b7280]' }[status]
  const statusLabel = { goal: 'On target! 🎯', close: 'Nearly there!', behind: 'Keep pushing!', unknown: 'No data yet' }[status]

  async function handleDelete() {
    if (!confirm(`Delete "${goal.label}"?`)) return
    setDeleting(true)
    await fetch(`/api/goals/${goal.id}`, { method: 'DELETE' })
    onDelete(goal.id)
  }

  return (
    <>
      <div className="card glow-orange fade-up" style={{ paddingBottom: '2rem' }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-lg leading-tight truncate">{goal.label}</h3>
            <p className="text-[#6b7280] text-xs mt-0.5">
              {isPast
                ? `Raced ${format(raceDate, 'MMM d, yyyy')}`
                : `${format(raceDate, 'MMM d, yyyy')} · ${daysLeft}d away`}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md bg-[#1c1c1c] ${statusColor}`}>
              {statusLabel}
            </span>
            <button onClick={() => setEditing(true)} className="text-[#4b5563] hover:text-white p-1 transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={handleDelete} disabled={deleting} className="text-[#4b5563] hover:text-red-400 p-1 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Target pace</div>
            <div className="stat-num text-xl font-bold text-[#f97316]">{paceStr(targetPace)}</div>
            <div className="text-[#6b7280] text-xs">/km</div>
          </div>
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Current pace</div>
            <div className={`stat-num text-xl font-bold ${statusColor}`}>
              {currentPace ? paceStr(currentPace) : '--:--'}
            </div>
            <div className="text-[#6b7280] text-xs">/km est.</div>
          </div>
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Est. time</div>
            <div className={`stat-num text-xl font-bold ${statusColor}`}>
              {currentSecs ? formatGoalTime(currentSecs) : '--:--'}
            </div>
            <div className="text-[#6b7280] text-xs">{currentEstimateSecs ? 'from analysis' : currentSecs ? 'your estimate' : 'no data'}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-[#6b7280] mb-1.5">
            <span>Progress to goal</span>
            <span className="font-mono">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#f97316] transition-all duration-700"
              style={{ width: `${progress * 100}%` }} />
          </div>
          {goal.current_secs && (
            <div className="flex justify-between text-[10px] text-[#3a3a3a] mt-1 font-mono">
              <span>{formatGoalTime(goal.current_secs)}</span>
              <span>{formatGoalTime(goal.target_secs)}</span>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <GoalSetupModal
          existing={goal}
          onSave={updated => { onUpdate(updated); setEditing(false) }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
