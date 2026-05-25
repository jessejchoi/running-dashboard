'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { metersToKm, metersToMiles, distanceUnitLabel, isoWeek } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'
import { format, parseISO } from 'date-fns'

interface Activity { start_date: string; distance: number }
interface Props { activities: Activity[]; weeks?: number }

// ── PULSE tokens ──────────────────────────────────────────────────────
const MAGENTA = '#e84d85'
const INK_2   = '#303037'  // bar default
const INK_3   = '#26262b'  // bar quiet (below avg)
const FG_3    = '#8b837c'

function CustomTooltip({ active, payload, label, unitLabel }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2 text-xs" style={{ background: '#151517', border: '1px solid rgba(241,237,232,0.18)' }}>
      <div className="font-mono uppercase tracking-[0.16em] text-[10px] mb-1" style={{ color: FG_3 }}>{label}</div>
      <div className="font-mono font-bold" style={{ color: '#f1ede8' }}>{payload[0].value.toFixed(1)} <span style={{ color: FG_3 }}>{unitLabel}</span></div>
    </div>
  )
}

export default function WeeklyMileageChart({ activities, weeks = 16 }: Props) {
  const { unit } = useUnit()
  const unitLabel = distanceUnitLabel(unit)

  const weekMap: Record<string, number> = {}
  for (const a of activities) {
    const w = isoWeek(new Date(a.start_date))
    const dist = unit === 'miles' ? metersToMiles(a.distance) : metersToKm(a.distance)
    weekMap[w] = (weekMap[w] ?? 0) + dist
  }

  const data = Array.from({ length: weeks }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (weeks - 1 - i) * 7)
    const w = isoWeek(d)
    return {
      week: format(parseISO(w), 'MMM d'),
      km: parseFloat((weekMap[w] ?? 0).toFixed(1)),
      isCurrentWeek: i === weeks - 1,
    }
  })

  const avg = data.reduce((s, d) => s + d.km, 0) / (data.filter(d => d.km > 0).length || 1)

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={14} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <XAxis
            dataKey="week"
            tick={{ fill: FG_3, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={{ fill: FG_3, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip unitLabel={unitLabel} />} cursor={{ fill: 'rgba(232,77,133,0.05)' }} />
          <ReferenceLine y={avg} stroke={MAGENTA} strokeDasharray="3 3" strokeOpacity={0.45} strokeWidth={1} />
          <Bar dataKey="km">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.isCurrentWeek ? MAGENTA : entry.km > avg ? INK_2 : INK_3} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
