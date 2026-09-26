'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import RunTypeSelector from '@/components/RunTypeSelector'
import RunSurfaceBadge from '@/components/RunSurfaceBadge'
import { speedToPace, formatDuration, formatDistance, paceUnitLabel, toJakartaDate, type DistanceUnit } from '@/lib/utils'
import { RUN_TYPES, type RunType } from '@/lib/runtypes'
import { isTreadmillRun } from '@/lib/run-classification/surface'
import Eyebrow from '@/components/Eyebrow'

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
    <section className="panel grid-cols-1 mt-3 mb-3 fade-up">
      <div className="cell" style={{ paddingBottom: 6 }}>
        <Eyebrow
          n="10"
          label="Recent runs"
          right={<Link href="/runs" prefetch={true} className="inline-flex items-center min-h-[32px]">View all →</Link>}
          className="!mb-0"
        />
      </div>
        {runs.map((run) => {
          const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
          const isFast = paceSeconds <= 270
          const isTreadmill = isTreadmillRun(run)
          const typeConfig = runTypes[run.id] ? RUN_TYPES[runTypes[run.id] as RunType] : null

          return (
            <div
              key={run.id}
              className="cell transition-colors duration-100"
              style={{
                background: hoveredId === run.id ? 'var(--surface-2)' : undefined,
                paddingTop: 11,
                paddingBottom: 11,
              }}
              onMouseEnter={() => setHoveredId(run.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Row: date + name + stats */}
              <div className="flex items-center gap-3 min-w-0">

                {/* Date — links to detail */}
                <Link
                  href={`/runs/${run.id}`}
                  className="font-mono text-[11px] uppercase tracking-[0.08em] shrink-0 whitespace-nowrap hover:text-white transition-colors w-14"
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
                  className="text-sm font-medium text-white truncate flex-1 min-w-0 hover:text-orange-400 transition-colors"
                >
                  {run.name}
                </Link>
                {isTreadmill && <div className="shrink-0 hidden sm:block"><RunSurfaceBadge run={run} /></div>}

                {/* Stats — right aligned */}
                <div className="flex items-center gap-4 shrink-0 ml-auto">
                  {/* Distance */}
                  <span className="stat-num text-sm font-bold text-right sm:w-20" style={{ color: 'var(--text-1)' }}>
                    {formatDistance(run.distance, unit).split(' ')[0]}
                    <span className="font-normal text-[10px] uppercase ml-1" style={{ color: 'var(--text-3)' }}>{formatDistance(run.distance, unit).split(' ')[1]}</span>
                  </span>

                  {/* Pace */}
                  <span
                    className="font-mono text-xs hidden sm:block w-20 text-right"
                    style={{ color: isFast ? 'var(--success)' : 'var(--text-2)' }}
                  >
                    {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
                  </span>

                  {/* Duration */}
                  <span className="font-mono text-xs hidden md:block w-16 text-right" style={{ color: 'var(--text-2)' }}>
                    {formatDuration(run.moving_time)}
                  </span>

                  {/* HR */}
                  {run.average_heartrate ? (
                    <span className="font-mono text-xs hidden lg:block w-16 text-right" style={{ color: 'var(--text-muted)' }}>
                      {Math.round(run.average_heartrate)} bpm
                    </span>
                  ) : (
                    <span className="font-mono text-xs hidden lg:block w-16 text-right" style={{ color: 'var(--text-3)' }}>—</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
    </section>
  )
}
