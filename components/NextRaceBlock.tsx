import Link from 'next/link'
import { Suspense } from 'react'
import { format } from 'date-fns'
import Eyebrow from '@/components/Eyebrow'
import { dashboardEstimates } from '@/components/DashboardRaceSection'
import { localDate } from '@/lib/calendar'
import { estimateValues } from '@/lib/estimates'
import { distanceKm, distanceShortLabel, formatGoalTime, type UserGoal } from '@/lib/goals'
import { type DistanceUnit } from '@/lib/utils'

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/55">{k}</p>
      <p className="stat-num font-bold text-lg sm:text-xl mt-1 truncate">{v}</p>
    </div>
  )
}

/** Estimate row streams in after the block paints; the goal itself is fast-path data. */
async function EstimateRow({ athleteId, goal, unit }: { athleteId: number; goal: UserGoal; unit: DistanceUnit }) {
  const est = estimateValues(await dashboardEstimates(athleteId))[goal.distance_key]
  if (est == null) {
    return (
      <div className="race-block-row">
        <Stat k="Estimate" v="--:--" />
        <Stat k="To find" v="--" />
        <Stat k={unit === 'miles' ? 'Per mi' : 'Per km'} v="--" />
      </div>
    )
  }
  const gap = est - goal.target_secs
  const perUnit = Math.abs(gap) / (distanceKm(goal.distance_key) / (unit === 'miles' ? 1.60934 : 1))
  const perText = perUnit < 60 ? `${Math.round(perUnit)}s` : formatGoalTime(perUnit)
  return (
    <div className="race-block-row">
      <Stat k="Estimate" v={formatGoalTime(est)} />
      <Stat k={gap > 0 ? 'To find' : 'Ahead by'} v={formatGoalTime(Math.abs(gap))} />
      <Stat k={unit === 'miles' ? 'Per mi' : 'Per km'} v={`${gap > 0 ? '−' : '+'}${perText}`} />
    </div>
  )
}

/**
 * The one solid-orange block on the dashboard: countdown to the primary race.
 * Falls back to a plain cell with a link to set a goal.
 */
export default function NextRaceBlock({
  athleteId,
  goal,
  unit,
  className = '',
}: {
  athleteId: number
  goal: UserGoal | null
  unit: DistanceUnit
  className?: string
}) {
  if (!goal) {
    return (
      <div className={`cell flex flex-col ${className}`}>
        <Eyebrow n="00" label="Next race" />
        <p className="font-display font-extrabold uppercase text-2xl leading-none mt-2">No race booked</p>
        <p className="text-sm mt-3" style={{ color: 'var(--text-2)' }}>
          Add a race goal to get a countdown and a live estimate here.
        </p>
        <Link href="/goals" className="rd-button mt-auto self-start inline-flex items-center" style={{ marginTop: 24 }}>
          Set a race goal →
        </Link>
      </div>
    )
  }

  const days = Math.max(
    0,
    Math.round(
      (Date.parse(goal.race_date) - Date.parse(localDate(new Date(), goal.timezone ?? 'Asia/Jakarta'))) / 86400000,
    ),
  )
  const short = distanceShortLabel(goal.distance_key)

  return (
    <Link href="/goals" className={`cell race-block ${className}`} aria-label={`${goal.label}: ${days} days to go`}>
      <span className="race-block-mark" aria-hidden="true">{short}</span>
      <Eyebrow
        n="00"
        label={`Next race · ${format(new Date(goal.race_date + 'T12:00:00'), 'MMM d')}`}
        right={<span className="hidden sm:inline truncate max-w-[140px] normal-case tracking-normal">{goal.label}</span>}
      />
      <div className="relative flex items-baseline gap-2.5 mt-1">
        <span className="font-display font-extrabold leading-[0.8] tracking-[-0.05em]" style={{ fontSize: 'clamp(84px, 11vw, 116px)' }}>
          {days}
        </span>
        <span className="font-mono font-bold text-[13px] tracking-[0.16em]">{days === 1 ? 'DAY' : 'DAYS'}</span>
      </div>
      <p className="relative font-display font-extrabold uppercase text-lg sm:text-[22px] mt-4 mb-5">
        {short} · Sub {formatGoalTime(goal.target_secs)}
      </p>
      <Suspense
        fallback={
          <div className="race-block-row">
            <Stat k="Estimate" v="…" />
            <Stat k="To find" v="…" />
            <Stat k={unit === 'miles' ? 'Per mi' : 'Per km'} v="…" />
          </div>
        }
      >
        <EstimateRow athleteId={athleteId} goal={goal} unit={unit} />
      </Suspense>
    </Link>
  )
}
