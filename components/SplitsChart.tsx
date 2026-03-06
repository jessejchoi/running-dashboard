'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'

interface Split {
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  elevation_difference?: number
}

interface Props {
  splits: Split[]
  avgPace: number  // seconds per km
}

function paceLabel(s: number) {
  if (!s) return ''
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
      <div className="text-[#6b7280] mb-1">km {label}</div>
      <div className="font-mono text-white font-bold">{paceLabel(d.pace)}/km</div>
      {d.hr && <div className="text-[#6b7280] mt-0.5">{Math.round(d.hr)} bpm</div>}
    </div>
  )
}

export default function SplitsChart({ splits, avgPace }: Props) {
  const data = splits.map((s, i) => ({
    km: i + 1,
    pace: s.average_speed ? parseFloat((1000 / s.average_speed).toFixed(1)) : 0,
    hr: s.average_heartrate,
  })).filter(d => d.pace > 0 && d.pace < 600)

  const allPaces = data.map(d => d.pace)
  const minP = Math.min(...allPaces) - 15
  const maxP = Math.max(...allPaces) + 15

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} barSize={20} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="km"
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[minP, maxP]}
          reversed
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickFormatter={paceLabel}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine
          y={avgPace}
          stroke="#f97316"
          strokeDasharray="4 4"
          strokeOpacity={0.5}
          strokeWidth={1}
        />
        <Bar dataKey="pace" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.pace <= avgPace ? '#34d399' : '#f87171'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
