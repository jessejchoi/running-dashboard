'use client'
import Link from 'next/link'
import RunTypeSelector from '@/components/RunTypeSelector'
import { speedToPace, formatDuration, toJakartaDate, formatDistance, paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { format } from 'date-fns'

interface Props {
  run: any
  unit: DistanceUnit
}

export default function RunRow({ run, unit }: Props) {
  const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
  const isFast = paceSeconds <= 270
  const isTreadmill = run.run_type === 'treadmill' || run.raw?.trainer === true

  return (
    <tr
      className="run-row transition-colors"
      style={{ borderBottom: '1px solid var(--surface-2)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <td className={`px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-muted)' }}>
        <Link href={`/runs/${run.id}`} className="transition-colors hover:text-white" style={{ color: 'inherit' }}>
          {format(toJakartaDate(run.start_date), 'MMM d, yyyy')}
        </Link>
        {isTreadmill && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-3)' }}>🏃</span>}
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2">
        <RunTypeSelector activityId={run.id} current={run.run_type} isManual={run.run_type_manual ?? false} />
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--orange)' }}>
        {formatDistance(run.distance, unit)}
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap font-bold ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: isFast ? 'var(--success)' : 'var(--text-2)' }}>
        {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-2)' }}>
        {formatDuration(run.moving_time)}
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-2)' }}>
        {run.average_heartrate ? `${Math.round(run.average_heartrate)} bpm` : '—'}
      </td>
      <td className={`px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-2)' }}>
        {run.suffer_score ?? '—'}
      </td>
    </tr>
  )
}
