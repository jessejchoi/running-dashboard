'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { speedToPaceSeconds, metersToKm } from '@/lib/utils'
import { format } from 'date-fns'

interface Activity {
  start_date: string
  average_speed: number
  distance: number
  name: string
}

interface Props {
  activities: Activity[]
  targetPaceSeconds?: number  // e.g. 270 for 4:30/km
}

function paceLabel(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs max-w-[160px]">
      <div className="text-[#6b7280] mb-1 truncate">{d.name}</div>
      <div className="font-mono text-white font-bold">{paceLabel(d.pace)}/km</div>
      <div className="text-[#6b7280] mt-0.5">{d.dist} km · {d.date}</div>
    </div>
  )
}

export default function PaceTrendChart({ activities, targetPaceSeconds = 270 }: Props) {
  // Build last 60 runs sorted ascending
  const data = [...activities]
    .slice(0, 60)
    .reverse()
    .map(a => ({
      name: a.name,
      date: format(new Date(a.start_date), 'MMM d'),
      pace: speedToPaceSeconds(a.average_speed),
      dist: metersToKm(a.distance).toFixed(1),
    }))
    .filter(d => d.pace > 0 && d.pace < 600) // sanity filter

  // Y axis: flip so faster (lower seconds) = higher on chart
  const allPaces = data.map(d => d.pace)
  const minP = Math.min(...allPaces) - 15
  const maxP = Math.max(...allPaces) + 15

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          interval={Math.floor(data.length / 6)}
        />
        <YAxis
          domain={[minP, maxP]}
          reversed
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickFormatter={paceLabel}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={targetPaceSeconds}
          stroke="#f97316"
          strokeDasharray="4 4"
          strokeOpacity={0.6}
          strokeWidth={1.5}
          label={{
            value: `Goal ${paceLabel(targetPaceSeconds)}`,
            position: 'insideTopRight',
            fill: '#f97316',
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <Line
          type="monotone"
          dataKey="pace"
          stroke="#f97316"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: '#f97316', strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
