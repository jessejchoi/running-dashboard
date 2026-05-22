'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import RunTypeSelector from '@/components/RunTypeSelector'
import { speedToPace, formatDuration, formatDistance, paceUnitLabel, toJakartaDate, type DistanceUnit } from '@/lib/utils'
import { type RunType } from '@/lib/runtypes'

interface Activity {
  id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  suffer_score?: number
  total_elevation_gain?: number
  run_type: string | null
  run_type_manual: boolean
}

interface Props {
  runs: Activity[]
  unit: DistanceUnit
}

export default function RecentRunsCard({ runs, unit }: Props) {
  const [runTypes, setRunTypes] = useState<Record<number, string | null>>(
    Object.fromEntries(runs.map(r => [r.id, r.run_type]))
  )
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  if (runs.length === 0) return null

  return (
    <section className="mt-8 mb-[14px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-[28px] text-[#F4F4F4] uppercase leading-none">Recent Runs</h2>
        <Link href="/runs" prefetch={true} className="pulse-link">
          View all
        </Link>
      </div>
      <div className="card top-stripe-magenta fade-up" style={{ padding: '24px' }}>
        <span className="card-index">[09]</span>

      <div className="flex flex-col">
        {runs.map((run, i) => {
          const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
          const isFast = paceSeconds <= 270
          const isTreadmill = runTypes[run.id] === 'treadmill'
          const isLast = i === runs.length - 1

          return (
            <div
              key={run.id}
              className="transition-colors duration-100"
              style={{
                background: hoveredId === run.id ? 'var(--ink-2)' : 'transparent',
                borderBottom: isLast ? 'none' : '1px solid var(--hair-1)',
                borderLeft: hoveredId === run.id ? '3px solid var(--magenta)' : '3px solid transparent',
                opacity: isTreadmill ? 0.5 : 1,
                margin: '0 -14px',
                padding: '14px',
              }}
              onMouseEnter={() => setHoveredId(run.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Row: date + name + stats */}
              <div className="flex items-center gap-3 min-w-0">

                {/* Date — links to detail */}
                <Link
                  href={`/runs/${run.id}`}
                  className="font-mono text-xs shrink-0 hover:text-white transition-colors w-10"
                  style={{ color: 'var(--fg-4)' }}
                >
                  [{String(i + 1).padStart(2, '0')}]
                </Link>

                {/* Type selector */}
                <div className="shrink-0" onClick={e => e.stopPropagation()}>
                  <RunTypeSelector
                    activityId={run.id}
                    current={runTypes[run.id]}
                    isManual={run.run_type_manual}
                    onUpdate={(t: RunType | null) => setRunTypes(prev => ({ ...prev, [run.id]: t }))}
                  />
                </div>

                {/* Run name */}
                <Link
                  href={`/runs/${run.id}`}
                  className="font-display text-[16px] font-bold uppercase text-white truncate flex-1 min-w-0 hover:text-[var(--magenta)] transition-colors"
                >
                  {run.name}
                  <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--fg-3)' }}>
                    {format(toJakartaDate(run.start_date), 'MMM d')}
                  </span>
                </Link>

                {/* Stats — right aligned */}
                <div className="flex items-center gap-4 shrink-0 ml-auto">
                  {/* Distance */}
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--magenta)' }}>
                    {formatDistance(run.distance, unit)}
                  </span>

                  {/* Pace */}
                  <span
                    className="font-mono text-xs font-bold hidden sm:block"
                    style={{ color: isFast ? 'var(--acid)' : 'var(--fg-2)' }}
                  >
                    {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
                  </span>

                  {/* Duration */}
                  <span className="font-mono text-xs hidden md:block" style={{ color: 'var(--fg-2)' }}>
                    {formatDuration(run.moving_time)}
                  </span>

                  {/* HR */}
                  {run.average_heartrate ? (
                    <span className="font-mono text-xs hidden lg:block" style={{ color: 'var(--fg-3)' }}>
                      {Math.round(run.average_heartrate)} bpm
                    </span>
                  ) : (
                    <span className="font-mono text-xs hidden lg:block" style={{ color: 'var(--fg-4)' }}>--</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </section>
  )
}
