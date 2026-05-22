'use client'
import Link from 'next/link'
import RunTypeSelector from '@/components/RunTypeSelector'
import { speedToPace, formatDuration, toJakartaDate, formatDistance, paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { format } from 'date-fns'

interface Props {
  run: any
  unit: DistanceUnit
}

// ── Pulse run row ──────────────────────────────────────────────────────
// Hairline top borders, magenta hover stripe, mono everywhere, fast paces
// flip to acid lime. Display-cased run titles when present in `name`.
export default function RunRow({ run, unit }: Props) {
  const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
  const isFast = paceSeconds <= 270
  const isTreadmill = run.run_type === 'treadmill' || run.raw?.trainer === true

  return (
    <tr
      className="run-row transition-colors"
      style={{ borderTop: '1px solid var(--hair-1)' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--ink-2)'
        e.currentTarget.style.boxShadow = 'inset 3px 0 0 var(--magenta)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <td className={`px-2 sm:px-4 py-3 text-xs font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--fg-3)', letterSpacing: '0.06em' }}>
        <Link href={`/runs/${run.id}`} className="transition-colors hover:text-[var(--fg-1)]" style={{ color: 'inherit' }}>
          {format(toJakartaDate(run.start_date), 'MMM d, yyyy')}
        </Link>
        {isTreadmill && <span className="ml-2 text-[10px]" style={{ color: 'var(--fg-4)' }}>TRD</span>}
      </td>
      <td className="px-2 sm:px-4 py-2">
        <RunTypeSelector activityId={run.id} current={run.run_type} isManual={run.run_type_manual ?? false} />
      </td>
      <td className={`px-2 sm:px-4 py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--magenta)', fontWeight: 700 }}>
        {formatDistance(run.distance, unit)}
      </td>
      <td className={`px-2 sm:px-4 py-3 font-mono whitespace-nowrap font-bold ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: isFast ? 'var(--acid)' : 'var(--fg-1)' }}>
        {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
      </td>
      <td className={`px-2 sm:px-4 py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--fg-2)' }}>
        {formatDuration(run.moving_time)}
      </td>
      <td className={`px-2 sm:px-4 py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--fg-2)' }}>
        {run.average_heartrate ? `${Math.round(run.average_heartrate)} bpm` : '—'}
      </td>
      <td className={`px-2 sm:px-4 py-3 whitespace-nowrap font-mono ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--fg-2)' }}>
        {run.suffer_score ?? '—'}
      </td>
    </tr>
  )
}
