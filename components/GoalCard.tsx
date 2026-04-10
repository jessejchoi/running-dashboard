'use client'
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import { formatGoalTime, paceSecs, distanceKm, type UserGoal, type DistanceKey } from '@/lib/goals'
import { paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import GoalSetupModal from './GoalSetupModal'

const SOURCE_LABELS: Record<string, string> = {
  interval: 'interval',
  threshold: 'threshold',
  long_run: 'long run',
  easy_trend: 'easy trend',
  race_result: 'race',
}

const DIST_COLORS: Record<string, { text: string; bar: string; bg: string; short: string }> = {
  '5k':            { text: 'text-red-400',    bar: 'bg-red-400',    bg: 'bg-red-400/10',    short: '5K' },
  '10k':           { text: 'text-orange-400', bar: 'bg-orange-400', bg: 'bg-orange-400/10', short: '10K' },
  'half_marathon': { text: 'text-sky-400',    bar: 'bg-sky-400',    bg: 'bg-sky-400/10',    short: 'HM' },
  'hm':            { text: 'text-sky-400',    bar: 'bg-sky-400',    bg: 'bg-sky-400/10',    short: 'HM' },
  'marathon':      { text: 'text-purple-400', bar: 'bg-purple-400', bg: 'bg-purple-400/10', short: 'FM' },
  'fm':            { text: 'text-purple-400', bar: 'bg-purple-400', bg: 'bg-purple-400/10', short: 'FM' },
}

interface Props {
  goal: UserGoal
  currentEstimateSecs?: number | null   // from analysis engine
  confidence?: number                    // 0-1 confidence from combiner
  sourceCounts?: Record<string, number>  // { source: count }
  onUpdate: (goal: UserGoal) => void
  onDelete: (id: string) => void
  unit?: DistanceUnit
}

function paceStr(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function GoalCard({ goal, currentEstimateSecs, confidence, sourceCounts, onUpdate, onDelete, unit = 'km' }: Props) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const dist = DIST_COLORS[goal.distance_key] ?? { text: 'text-[#f97316]', bar: 'bg-[#f97316]', bg: 'bg-[#f97316]/10', short: goal.distance_key.toUpperCase() }

  const today    = new Date()
  const raceDate = new Date(goal.race_date)
  const daysLeft = differenceInDays(raceDate, today)
  const isPast   = daysLeft < 0

  // Best current pace: prefer analysis engine, fall back to user's manual estimate
  const currentSecs = currentEstimateSecs ?? goal.current_secs ?? null
  const km          = distanceKm(goal.distance_key as DistanceKey)
  const targetPace  = paceSecs(goal.target_secs, goal.distance_key as DistanceKey)
  const currentPace = currentSecs ? currentSecs / km : null

  // Convert sec/km → sec/mile for display when miles
  const paceMultiplier = unit === 'miles' ? 1.60934 : 1
  const displayTargetPace  = targetPace * paceMultiplier
  const displayCurrentPace = currentPace ? currentPace * paceMultiplier : null

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

  const statusColor = { goal: 'text-[var(--success)]', close: 'text-[var(--warning)]', behind: 'text-[var(--accent)]', unknown: 'text-[var(--text-3)]' }[status]
  const statusLabel = { goal: 'On target! 🎯', close: 'Nearly there!', behind: 'Keep pushing!', unknown: 'No data yet' }[status]

  async function handleDelete() {
    if (!confirm(`Delete "${goal.label}"?`)) return
    setDeleting(true)
    await fetch(`/api/goals/${goal.id}`, { method: 'DELETE' })
    onDelete(goal.id)
  }

  return (
    <>
      <div className="card fade-up" style={{ paddingBottom: '1.5rem' }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-display font-bold text-lg leading-tight truncate">{goal.label}</h3>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${dist.text} ${dist.bg}`}>{dist.short}</span>
            </div>
            <p className="text-[#6b7280] text-xs">
              {isPast
                ? `Raced ${format(raceDate, 'MMM d, yyyy')}`
                : `${format(raceDate, 'MMM d, yyyy')} · ${daysLeft}d away`}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md bg-[#1c1c1c] ${statusColor}`}>
              {statusLabel}
            </span>
            <button onClick={() => setEditing(true)} className="text-[#4b5563] hover:text-white p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={handleDelete} disabled={deleting} className="text-[#4b5563] hover:text-red-400 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Target pace</div>
            <div className={`stat-num text-xl font-bold ${dist.text}`}>{paceStr(displayTargetPace)}</div>
            <div className="text-[#6b7280] text-xs">{paceUnitLabel(unit)}</div>
          </div>
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Current pace</div>
            <div className={`stat-num text-xl font-bold ${statusColor}`}>
              {displayCurrentPace ? paceStr(displayCurrentPace) : '--:--'}
            </div>
            <div className="text-[#6b7280] text-xs">{paceUnitLabel(unit)} est.</div>
          </div>
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Est. time</div>
            <div className={`stat-num text-xl font-bold ${statusColor}`}>
              {currentSecs ? formatGoalTime(currentSecs) : '--:--'}
            </div>
            <div className="text-[#6b7280] text-xs">
              {currentEstimateSecs && confidence != null ? (
                <span className={`font-mono ${confidence >= 0.7 ? 'text-[var(--success)]' : confidence >= 0.4 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}>
                  {confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'med' : 'low'} conf.
                </span>
              ) : currentEstimateSecs ? 'from analysis' : currentSecs ? 'your estimate' : 'no data'}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-[#6b7280] mb-1.5">
            <span>Progress to goal</span>
            <span className="font-mono">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${dist.bar} transition-all duration-700`}
              style={{ width: `${progress * 100}%` }} />
          </div>
          {goal.current_secs && (
            <div className="flex justify-between text-[10px] text-[#3a3a3a] mt-1 font-mono">
              <span>{formatGoalTime(goal.current_secs)}</span>
              <span>{formatGoalTime(goal.target_secs)}</span>
            </div>
          )}
          {sourceCounts && Object.keys(sourceCounts).length > 0 && (
            <div className="text-[10px] text-[#4b5563] mt-2">
              Based on {Object.entries(sourceCounts).map(([source, count], i, arr) => (
                <span key={source}>
                  {count} {SOURCE_LABELS[source] ?? source}{count > 1 ? 's' : ''}
                  {i < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
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
