'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import RunTypeSelector from '@/components/RunTypeSelector'
import { formatDistanceShort, speedToPace, paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { type RunType } from '@/lib/runtypes'

interface Activity {
  id: number
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
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

  if (runs.length === 0) return null

  return (
    <div className="card fade-up mb-3" style={{ padding: '1.25rem' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Recent Runs</p>
        <Link
          href="/runs"
          className="font-mono text-xs transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--orange)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          View all →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {runs.map(run => (
          <div
            key={run.id}
            className="flex items-center gap-3 py-2"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {/* Date */}
            <span className="font-mono text-xs shrink-0 w-12" style={{ color: 'var(--text-muted)' }}>
              {format(new Date(run.start_date), 'MMM d')}
            </span>

            {/* Type selector */}
            <div className="shrink-0">
              <RunTypeSelector
                activityId={run.id}
                current={runTypes[run.id]}
                isManual={run.run_type_manual}
                onUpdate={(t: RunType | null) => setRunTypes(prev => ({ ...prev, [run.id]: t }))}
              />
            </div>

            {/* Distance + Pace */}
            <div className="flex items-center gap-3 ml-auto shrink-0">
              <span className="stat-num text-sm font-bold text-white">
                {formatDistanceShort(run.distance, unit)}
              </span>
              {run.average_speed > 0 && (
                <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {speedToPace(run.average_speed, unit)}&nbsp;{paceUnitLabel(unit)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
