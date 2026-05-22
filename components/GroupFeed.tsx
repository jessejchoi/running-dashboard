'use client'
import Link from 'next/link'
import { format } from 'date-fns'
import { toJakartaDate, speedToPace, formatDuration, formatDistanceShort, paceUnitLabel, type DistanceUnit } from '@/lib/utils'

interface Run {
  id: number
  athlete_id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate: number | null
  run_type: string | null
}

interface MemberMap {
  [athlete_id: number]: {
    name: string
    profile_pic: string | null
    is_me: boolean
  }
}

interface Props {
  runs: Run[]
  memberMap: MemberMap
  myAthleteId: number
  groupId: string
  unit?: DistanceUnit
}

const RUN_TYPE_COLORS: Record<string, string> = {
  intervals:    '#ef4444',
  interval_5k:  '#ef4444',
  tempo:        '#fb7185',
  threshold:    '#ff1d6c',
  long_easy:    '#38bdf8',
  long_steady:  '#22d3ee',
  long_progressive: '#5ad7ff',
  easy:         '#d9ff36',
  easy_strides: '#2dd4bf',
  recovery:     '#86efac',
}

function Avatar({ name, pic }: { name: string; pic: string | null }) {
  if (pic) return <img src={pic} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-[#ff1d6c]/20 flex items-center justify-center text-[#ff1d6c] font-bold text-xs shrink-0">
      {initials}
    </div>
  )
}

export default function GroupFeed({ runs, memberMap, myAthleteId, groupId, unit = 'km' }: Props) {
  // 15% taller: 336 * 1.15 ≈ 387px
  const maxHeight = runs.length === 0 ? 'auto' : '387px'

  return (
    <div className="card fade-up" style={{ maxHeight, display: 'flex', flexDirection: 'column', paddingBottom: '2rem' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
        <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest leading-tight">
          <span className="sm:hidden">Group Activities<br />This Week</span>
          <span className="hidden sm:inline">Group Activities This Week</span>
        </h2>
        <Link
          href={`/group/${groupId}`}
          className="flex items-center text-xs text-[#ff1d6c] hover:underline whitespace-nowrap shrink-0 ml-2 min-h-[44px]"
          prefetch
        >
          All runs →
        </Link>
      </div>

      {/* Scrollable feed */}
      <div className="space-y-3 overflow-y-auto" style={{ flex: 1, minHeight: 0 }}>
        {runs.length === 0 ? (
          <p className="text-[#4b5563] text-sm text-center py-4">No runs this week yet.</p>
        ) : runs.map(run => {
          const member = memberMap[run.athlete_id]
          const isMe = run.athlete_id === myAthleteId
          const dotColor = RUN_TYPE_COLORS[run.run_type ?? ''] ?? '#4b5563'

          return (
            <div key={run.id} className="flex items-start gap-3">
              <Avatar name={member?.name ?? '?'} pic={member?.profile_pic ?? null} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-xs font-bold ${isMe ? 'text-white' : 'text-[#d1d5db]'}`}>
                    {isMe ? 'You' : member?.name?.split(' ')[0] ?? '?'}
                  </span>
                  <span className="text-[#4b5563] text-[10px]">
                    {format(toJakartaDate(run.start_date), 'EEE MMM d')}
                  </span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                </div>
                <Link
                  href={`/runs/${run.id}`}
                  prefetch
                  className={`text-sm font-medium block truncate mb-1 hover:text-[#ff1d6c] transition-colors ${isMe ? 'text-white' : 'text-[#9ca3af]'}`}
                >
                  {run.name}
                </Link>
                <div className="flex gap-3 text-xs font-mono">
                  <span className={isMe ? 'text-[#ff1d6c] font-bold' : 'text-[#6b7280]'}>
                    {formatDistanceShort(run.distance, unit)}
                  </span>
                  <span className={isMe ? 'text-white' : 'text-[#6b7280]'}>
                    {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
                  </span>
                  <span className="text-[#4b5563]">{formatDuration(run.moving_time)}</span>
                  {run.average_heartrate && (
                    <span className="text-[#4b5563]">{Math.round(run.average_heartrate)} bpm</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
