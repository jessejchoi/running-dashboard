'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { metersToKm, metersToMiles, distanceUnitLabel } from '@/lib/utils'
import { addDays, weekStart } from '@/lib/calendar'
import { useUnit } from '@/lib/unit-context'
import { format, parseISO } from 'date-fns'

interface Activity {
  /** Local calendar date the run happened on. */
  day: string
  distance: number
}

interface Props {
  activities: Activity[]
  /** The runner's local date. */
  today: string
  weeks?: number
}

function CustomTooltip({ active, payload, label, unitLabel }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
      <div className="text-[#6b7280] mb-1">{label}</div>
      <div className="font-mono text-white font-bold">{payload[0].value.toFixed(1)} {unitLabel}</div>
    </div>
  )
}

const SEG = 4 // segment height, px
const SEG_GAP = 2

/** Timing-display bar: a stack of 4px segments; the top segment is lit on past weeks. */
function SegmentedBar({ x, y, width, height, payload }: any) {
  if (!height || height <= 0) return null
  const count = Math.max(1, Math.round(height / (SEG + SEG_GAP)))
  const bottom = y + height
  const current = payload?.isCurrentWeek
  return (
    <g>
      {Array.from({ length: count }, (_, k) => (
        <rect
          key={k}
          x={x}
          y={bottom - (k + 1) * (SEG + SEG_GAP) + SEG_GAP}
          width={width}
          height={SEG}
          fill={current ? '#f97316' : k === count - 1 ? '#3f3f46' : '#232323'}
        />
      ))}
    </g>
  )
}

export default function WeeklyMileageChart({ activities, today, weeks = 16 }: Props) {
  const { unit } = useUnit()
  const unitLabel = distanceUnitLabel(unit)

  const weekMap: Record<string, number> = {}
  for (const a of activities) {
    const w = weekStart(a.day)
    const dist = unit === 'miles' ? metersToMiles(a.distance) : metersToKm(a.distance)
    weekMap[w] = (weekMap[w] ?? 0) + dist
  }

  const data = Array.from({ length: weeks }, (_, i) => {
    const w = addDays(weekStart(today), -(weeks - 1 - i) * 7)
    return {
      week: format(parseISO(w), 'MMM d'),
      km: parseFloat((weekMap[w] ?? 0).toFixed(1)),
      isCurrentWeek: i === weeks - 1,
    }
  })

  const avg = data.reduce((s, d) => s + d.km, 0) / (data.filter(d => d.km > 0).length || 1)

  return (
    // Explicit pixel height on a plain div — Recharts recommended pattern
    <div style={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="18%" margin={{ top: 4, right: 14, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="week"
            tick={{ fill: '#4b5563', fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}
            ticks={data.filter((_, i) => (data.length - 1 - i) % 4 === 0).map(d => d.week)}
            tickFormatter={(v: string) => (v === data[data.length - 1].week ? 'THIS WK' : v.toUpperCase())}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis hide domain={[0, (max: number) => max * 1.08]} />
          <Tooltip content={<CustomTooltip unitLabel={unitLabel} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <ReferenceLine y={avg} stroke="#f97316" strokeDasharray="3 4" strokeOpacity={0.45} strokeWidth={1} />
          <Bar dataKey="km" shape={<SegmentedBar />} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
