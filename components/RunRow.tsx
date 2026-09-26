'use client'
import Link from 'next/link'
import RunTypeSelector from '@/components/RunTypeSelector'
import RunSurfaceBadge from '@/components/RunSurfaceBadge'
import { speedToPace, formatDuration, formatDistance, paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { runWallTime } from '@/lib/calendar'
import { format } from 'date-fns'
import { isTreadmillRun } from '@/lib/run-classification/surface'

interface Props {
  run: any
  unit: DistanceUnit
}

export default function RunRow({ run, unit }: Props) {
  const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
  const isFast = paceSeconds <= 270
  const isTreadmill = isTreadmillRun(run)
  const primaryRunType = run.run_type === 'treadmill' ? null : run.run_type

  return (
    <tr
      className="run-row transition-colors"
      style={{ borderBottom: '1px solid var(--surface-2)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        <Link href={`/runs/${run.id}`} className="transition-colors hover:text-white" style={{ color: 'inherit' }}>
          {format(runWallTime(run), 'MMM d, yyyy')}
        </Link>
        {isTreadmill && <span className="ml-2"><RunSurfaceBadge run={run} /></span>}
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2">
        <RunTypeSelector activityId={run.id} current={primaryRunType} isManual={run.run_type_manual ?? false} />
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap" style={{ color: 'var(--orange)' }}>
        {formatDistance(run.distance, unit)}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap font-bold" style={{ color: isFast ? 'var(--success)' : 'var(--text-2)' }}>
        {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
        {formatDuration(run.moving_time)}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
        {run.average_heartrate ? `${Math.round(run.average_heartrate)} bpm` : '—'}
      </td>
      <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
        {run.suffer_score ?? '—'}
      </td>
    </tr>
  )
}
