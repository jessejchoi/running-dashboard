'use client'
import { type RaceGoal, speedToPaceSeconds, metersToKm, formatDuration } from '@/lib/utils'
import { differenceInDays, format } from 'date-fns'

interface Activity {
  start_date: string
  average_speed: number
  distance: number
  moving_time: number
}

interface Props {
  goal: RaceGoal
  activities: Activity[]
  currentEstimateSecs?: number | null  // estimated finish time from analysis
}

export default function GoalCard({ goal, activities, currentEstimateSecs }: Props) {
  const today = new Date()
  const daysLeft = differenceInDays(goal.raceDate, today)
  const isPast = daysLeft < 0

  // Use analysis estimate if available, otherwise fall back to best recent run
  const currentTimeSecs = currentEstimateSecs ?? null
  const currentPaceSeconds = currentTimeSecs ? currentTimeSecs / (goal.distance / 1000) : null
  const targetPace = goal.targetPace

  // Progress: 0 = untrained, 1 = at goal pace
  // We use pace gap as proxy. If pace gap <= 0 you're there
  let progress = 0
  if (currentPaceSeconds) {
    // Assume "baseline" is 30s/km slower than target
    const baseline = targetPace + 60
    progress = Math.min(1, Math.max(0, (baseline - currentPaceSeconds) / (baseline - targetPace)))
  }

  const paceLabel = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.round(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const status: 'ahead' | 'close' | 'behind' | 'unknown' =
    !currentPaceSeconds ? 'unknown'
    : currentPaceSeconds <= targetPace ? 'ahead'
    : currentPaceSeconds <= targetPace + 15 ? 'close'
    : 'behind'

  const statusColor = {
    ahead: 'text-emerald-400',
    close: 'text-yellow-400',
    behind: 'text-red-400',
    unknown: 'text-[#6b7280]',
  }[status]

  const statusLabel = {
    ahead: 'On target',
    close: 'Nearly there',
    behind: 'Work needed',
    unknown: 'No data yet',
  }[status]

  return (
    <div className="card glow-orange fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-lg leading-tight">{goal.label}</h3>
          <p className="text-[#6b7280] text-xs mt-0.5">
            {isPast ? `Raced ${format(goal.raceDate, 'MMM d, yyyy')}` : `${format(goal.raceDate, 'MMM d, yyyy')} · ${daysLeft}d away`}
          </p>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md bg-[#1c1c1c] ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Target pace</div>
          <div className="stat-num text-xl font-bold text-[#f97316]">{paceLabel(targetPace)}</div>
          <div className="text-[#6b7280] text-xs">/km</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Current pace</div>
          <div className={`stat-num text-xl font-bold ${statusColor}`}>
            {currentPaceSeconds ? paceLabel(currentPaceSeconds) : '--:--'}
          </div>
          <div className="text-[#6b7280] text-xs">/km est.</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Est. time</div>
          <div className={`stat-num text-xl font-bold ${statusColor}`}>
            {currentTimeSecs ? formatDuration(currentTimeSecs) : '--:--'}
          </div>
          <div className="text-[#6b7280] text-xs">{currentEstimateSecs ? 'from analysis' : 'no data'}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-[#6b7280] mb-1.5">
          <span>Progress to goal</span>
          <span className="font-mono">{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#f97316] transition-all duration-700"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
