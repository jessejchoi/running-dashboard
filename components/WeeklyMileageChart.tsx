'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { metersToKm, isoWeek } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

interface Activity {
  start_date: string
  distance: number
}

interface Props {
  activities: Activity[]
  weeks?: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
      <div className="text-[#6b7280] mb-1">{label}</div>
      <div className="font-mono text-white font-bold">{payload[0].value.toFixed(1)} km</div>
    </div>
  )
}

export default function WeeklyMileageChart({ activities, weeks = 16 }: Props) {
  // Aggregate by week
  const weekMap: Record<string, number> = {}
  for (const a of activities) {
    const w = isoWeek(new Date(a.start_date))
    weekMap[w] = (weekMap[w] ?? 0) + metersToKm(a.distance)
  }

  // Build last N weeks
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

  const avg = data.reduce((s, d) => s + d.km, 0) / data.filter(d => d.km > 0).length || 0

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barSize={14} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="week"
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          interval={3}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine
          y={avg}
          stroke="#f97316"
          strokeDasharray="4 4"
          strokeOpacity={0.5}
          strokeWidth={1}
        />
        <Bar dataKey="km" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.isCurrentWeek ? '#f97316' : entry.km > avg ? '#3a3a3a' : '#242424'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
