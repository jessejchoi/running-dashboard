'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { type TrainingLoadPoint } from '@/lib/strava'
import { format, parseISO, subDays } from 'date-fns'

interface Props {
  data: TrainingLoadPoint[]
  days?: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const ctl  = payload.find((p: any) => p.dataKey === 'ctl')
  const atl  = payload.find((p: any) => p.dataKey === 'atl')
  const tsb  = payload.find((p: any) => p.dataKey === 'tsb')
  const load = payload.find((p: any) => p.dataKey === 'load')

  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs space-y-1">
      <div className="text-[#6b7280] mb-1">{label}</div>
      {load?.value > 0 && <div className="text-[#4b5563]">Daily load: <span className="text-white font-mono">{load.value}</span></div>}
      <div className="text-orange-400">Fitness (CTL): <span className="font-mono">{ctl?.value?.toFixed(1)}</span></div>
      <div className="text-zinc-400">Fatigue (ATL): <span className="font-mono">{atl?.value?.toFixed(1)}</span></div>
      <div className="text-yellow-400">Form (TSB): <span className="font-mono">{tsb?.value?.toFixed(1)}</span></div>
    </div>
  )
}

export default function TrainingLoadChart({ data, days = 90 }: Props) {
  const cutoff = subDays(new Date(), days).toISOString().split('T')[0]
  const visible = data
    .filter(d => d.date >= cutoff)
    .map(d => ({
      ...d,
      label: format(parseISO(d.date), 'MMM d'),
    }))

  // Fitness / fatigue / form readouts live beside the chart on the dashboard.
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visible} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#1a1a1a" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#4b5563', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(visible.length / 6)}
          />
          <YAxis
            tick={{ fill: '#4b5563', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
          <ReferenceLine y={0} stroke="#2a2a2a" strokeWidth={1} />
          <Line type="monotone" dataKey="atl" stroke="#52525b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="tsb" stroke="#eab308" strokeWidth={1} strokeOpacity={0.6} dot={false} />
          <Line type="monotone" dataKey="ctl" stroke="#f97316" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
