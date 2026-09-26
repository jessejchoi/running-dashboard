'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import RunTypeSelector from '@/components/RunTypeSelector'
import RunSurfaceBadge from '@/components/RunSurfaceBadge'
import { speedToPace, formatDuration, formatDistance, paceUnitLabel, toJakartaDate, type DistanceUnit } from '@/lib/utils'
import { RUN_TYPES, type RunType } from '@/lib/runtypes'
import { isTreadmillRun } from '@/lib/run-classification/surface'

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
  raw?: any
}

interface Props {
  runs: Activity[]
  unit: DistanceUnit
}

export default function RecentRunsCard({ runs, unit }: Props) {
  const [runTypes, setRunTypes] = useState<Record<number, string | null>>(
    Object.fromEntries(runs.map(r => [r.id, r.run_type === 'treadmill' ? null : r.run_type]))
  )
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  if (runs.length === 0) return null

  return (
    <section className="mt-6 mb-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">Recent Runs</h2>
        <Link href="/runs" prefetch={true} className="font-mono text-xs text-[#f97316] hover:text-orange-400 transition-colors">
          View all →
        </Link>
      </div>
      <div className="card fade-up" style={{ padding: '1.25rem' }}>

      <div className="flex flex-col">
        {runs.map((run, i) => {
          const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
          const isFast = paceSeconds <= 270
          const isTreadmill = isTreadmillRun(run)
          const isLast = i === runs.length - 1
          const typeConfig = runTypes[run.id] ? RUN_TYPES[runTypes[run.id] as RunType] : null

          return (
            <div
              key={run.id}
              className="rounded-lg transition-colors duration-100"
              style={{
                background: hoveredId === run.id ? 'var(--surface-2)' : 'transparent',
                borderBottom: isLast ? 'none' : '1px solid var(--border)',
                margin: '0 -0.5rem',
                padding: '0.625rem 0.5rem',
              }}
              onMouseEnter={() => setHoveredId(run.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Row: date + name + stats */}
              <div className="flex items-center gap-3 min-w-0">

                {/* Date — links to detail */}
                <Link
                  href={`/runs/${run.id}`}
                  className="font-mono text-xs shrink-0 whitespace-nowrap hover:text-white transition-colors w-12"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {format(toJakartaDate(run.start_date), 'MMM d')}
                </Link>

                {/* Type dot — mobile only; the full selector pill is too wide to fit */}
                {typeConfig && (
                  <span
                    className={`sm:hidden shrink-0 w-2 h-2 rounded-full ${typeConfig.color}`}
                    style={{ background: 'currentColor' }}
                    title={typeConfig.label}
                  />
                )}

                {/* Type selector */}
                <div className="shrink-0 hidden sm:block" onClick={e => e.stopPropagation()}>
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
                  className="text-sm text-white truncate flex-1 min-w-0 hover:text-orange-400 transition-colors"
                >
                  {run.name}
                </Link>
                {isTreadmill && <div className="shrink-0 hidden sm:block"><RunSurfaceBadge run={run} /></div>}

                {/* Stats — right aligned */}
                <div className="flex items-center gap-4 shrink-0 ml-auto">
                  {/* Distance */}
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--orange)' }}>
                    {formatDistance(run.distance, unit)}
                  </span>

                  {/* Pace */}
                  <span
                    className="font-mono text-xs font-bold hidden sm:block"
                    style={{ color: isFast ? 'var(--success)' : 'var(--text-2)' }}
                  >
                    {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
                  </span>

                  {/* Duration */}
                  <span className="font-mono text-xs hidden md:block" style={{ color: 'var(--text-2)' }}>
                    {formatDuration(run.moving_time)}
                  </span>

                  {/* HR */}
                  {run.average_heartrate ? (
                    <span className="font-mono text-xs hidden lg:block" style={{ color: 'var(--text-muted)' }}>
                      {Math.round(run.average_heartrate)} bpm
                    </span>
                  ) : (
                    <span className="font-mono text-xs hidden lg:block" style={{ color: 'var(--text-3)' }}>—</span>
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
