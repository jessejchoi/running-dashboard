'use client'
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import { formatGoalTime, paceSecs, distanceKm, type UserGoal, type DistanceKey } from '@/lib/goals'
import { paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import GoalSetupModal from './GoalSetupModal'

// ── Pulse distance hue mapping ─────────────────────────────────────────
// 5K → magenta (peak, short and hard) · 10K → acid (the work zone) ·
// HM → ice (steady, informational) · FM → magenta (back to peak — the big one)
const DIST_COLORS: Record<string, { color: string; bg: string; short: string }> = {
  '5k':            { color: '#e84d85', bg: 'rgba(232,77,133,0.08)', short: '5K' },
  '10k':           { color: '#b8d957', bg: 'rgba(184,217,87,0.07)', short: '10K' },
  'half_marathon': { color: '#6bbfdf', bg: 'rgba(107,191,223,0.07)', short: 'HM' },
  'hm':            { color: '#6bbfdf', bg: 'rgba(107,191,223,0.07)', short: 'HM' },
  'marathon':      { color: '#e84d85', bg: 'rgba(232,77,133,0.08)', short: 'FM' },
  'fm':            { color: '#e84d85', bg: 'rgba(232,77,133,0.08)', short: 'FM' },
}

interface Props {
  goal: UserGoal
  currentEstimateSecs?: number | null
  confidence?: number
  sourceCounts?: Record<string, number>
  onUpdate: (goal: UserGoal) => void
  onDelete: (id: string) => void
  unit?: DistanceUnit
}

const DIST_SUFFIXES = /\s+(5[Kk]|10[Kk]|HM|FM|Half[- ]Marathon|Half Marathon|Marathon)$/i
function stripDistanceSuffix(label: string): string {
  return label.replace(DIST_SUFFIXES, '').trim()
}

function paceStr(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function GoalCard({ goal, currentEstimateSecs, confidence, sourceCounts, onUpdate, onDelete, unit = 'km' }: Props) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const dist = DIST_COLORS[goal.distance_key] ?? { color: '#e84d85', bg: 'rgba(232,77,133,0.08)', short: goal.distance_key.toUpperCase() }

  const today    = new Date()
  const raceDate = new Date(goal.race_date)
  const daysLeft = differenceInDays(raceDate, today)
  const isPast   = daysLeft < 0

  const currentSecs = currentEstimateSecs ?? goal.current_secs ?? null
  const km          = distanceKm(goal.distance_key as DistanceKey)
  const targetPace  = paceSecs(goal.target_secs, goal.distance_key as DistanceKey)
  const currentPace = currentSecs ? currentSecs / km : null

  const paceMultiplier = unit === 'miles' ? 1.60934 : 1
  const displayTargetPace  = targetPace * paceMultiplier
  const displayCurrentPace = currentPace ? currentPace * paceMultiplier : null

  const baseline = goal.current_secs ? goal.current_secs / km : targetPace + 30

  let progress = 0
  if (currentPace && baseline > targetPace) {
    progress = Math.min(1, Math.max(0, (baseline - currentPace) / (baseline - targetPace)))
  }

  const status =
    !currentPace ? 'unknown'
    : progress >= 1 ? 'goal'
    : progress >= 0.5 ? 'close'
    : 'behind'

  const statusColor = { goal: 'var(--acid)', close: 'var(--pulse-orange)', behind: 'var(--magenta)', unknown: 'var(--fg-3)' }[status]
  const statusLabel = { goal: 'ON TARGET', close: 'NEARLY THERE', behind: 'KEEP PUSHING', unknown: 'NO DATA' }[status]

  async function handleDelete() {
    if (!confirm(`Delete "${goal.label}"?`)) return
    setDeleting(true)
    await fetch(`/api/goals/${goal.id}`, { method: 'DELETE' })
    onDelete(goal.id)
  }

  return (
    <>
      <div className="card fade-up pulse-bar" style={{ paddingBottom: '1.5rem' }}>
        {/* Magenta top stripe in distance color */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: dist.color }} />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 mb-1">
              <h3 className="font-display font-bold text-2xl uppercase truncate" style={{ color: dist.color, letterSpacing: '-0.02em' }}>
                {stripDistanceSuffix(goal.label)}
              </h3>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 shrink-0" style={{ background: dist.color, color: 'var(--ink)' }}>
                {dist.short}
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>
              {isPast
                ? `RACED ${format(raceDate, 'MMM d, yyyy')}`
                : `${format(raceDate, 'MMM d, yyyy')} · ${daysLeft}D AWAY`}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-2 shrink-0">
            <span
              className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1"
              style={{ color: statusColor, border: `1px solid ${statusColor}` }}
            >
              {statusLabel}
            </span>
            <button onClick={() => setEditing(true)} className="p-1.5 flex items-center justify-center transition-colors" style={{ color: 'var(--fg-3)' }} aria-label="Edit">
              <Pencil size={13} />
            </button>
            <button onClick={handleDelete} disabled={deleting} className="p-1.5 flex items-center justify-center transition-colors" style={{ color: 'var(--fg-3)' }} aria-label="Delete">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--fg-3)' }}>TARGET</div>
            <div className="stat-num font-display font-bold text-2xl" style={{ color: dist.color, lineHeight: 1 }}>{paceStr(displayTargetPace)}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mt-1" style={{ color: 'var(--fg-3)' }}>{paceUnitLabel(unit)}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--fg-3)' }}>CURRENT</div>
            <div className="stat-num font-display font-bold text-2xl" style={{ color: statusColor, lineHeight: 1 }}>
              {displayCurrentPace ? paceStr(displayCurrentPace) : '--:--'}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mt-1" style={{ color: 'var(--fg-3)' }}>{paceUnitLabel(unit)} EST</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--fg-3)' }}>EST. TIME</div>
            <div className="stat-num font-display font-bold text-2xl" style={{ color: statusColor, lineHeight: 1 }}>
              {currentSecs ? formatGoalTime(currentSecs) : '--:--'}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mt-1" style={{ color: 'var(--fg-3)' }}>
              {currentEstimateSecs ? 'FROM ANALYSIS' : currentSecs ? 'YOUR ESTIMATE' : 'NO DATA'}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--fg-3)' }}>
            <span>PROGRESS TO GOAL</span>
            <span className="font-bold" style={{ color: 'var(--fg-1)' }}>{Math.round(progress * 100)}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--ink-3)', position: 'relative' }}>
            <div
              style={{
                height: '100%',
                background: dist.color,
                width: `${progress * 100}%`,
                transition: 'width 700ms cubic-bezier(0.2, 0.9, 0.25, 1)',
              }}
            />
          </div>
          {goal.current_secs && (
            <div className="flex justify-between text-[10px] mt-2 font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--fg-4)' }}>
              <span>{formatGoalTime(goal.current_secs)} BASELINE</span>
              <span>{formatGoalTime(goal.target_secs)} TARGET</span>
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
