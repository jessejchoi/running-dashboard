'use client'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import { type TrainingLoadPoint } from '@/lib/strava'
import { format, parseISO, subDays } from 'date-fns'

interface Props {
  data: TrainingLoadPoint[]
  days?: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const ctl = payload.find((p: any) => p.dataKey === 'ctl')
  const atl = payload.find((p: any) => p.dataKey === 'atl')
  const tsb = payload.find((p: any) => p.dataKey === 'tsb')
  const load = payload.find((p: any) => p.dataKey === 'load')

  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs space-y-1">
      <div className="text-[#6b7280] mb-1">{label}</div>
      {load?.value > 0 && <div className="text-[#4b5563]">Load: <span className="text-white font-mono">{load.value}</span></div>}
      <div className="text-blue-400">Fitness (CTL): <span className="font-mono">{ctl?.value?.toFixed(1)}</span></div>
      <div className="text-orange-400">Fatigue (ATL): <span className="font-mono">{atl?.value?.toFixed(1)}</span></div>
      <div className={tsb?.value >= 0 ? 'text-emerald-400' : 'text-red-400'}>
        Form (TSB): <span className="font-mono">{tsb?.value?.toFixed(1)}</span>
      </div>
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

  const today = data[data.length - 1]

  return (
    <div>
      {/* Current state summary */}
      {today && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-[#1c1c1c] rounded-lg px-3 py-2">
            <div className="text-[#6b7280] text-xs mb-1">Fitness (CTL)</div>
            <div className="font-mono text-blue-400 text-lg font-bold">{today.ctl.toFixed(1)}</div>
          </div>
          <div className="bg-[#1c1c1c] rounded-lg px-3 py-2">
            <div className="text-[#6b7280] text-xs mb-1">Fatigue (ATL)</div>
            <div className="font-mono text-orange-400 text-lg font-bold">{today.atl.toFixed(1)}</div>
          </div>
          <div className="bg-[#1c1c1c] rounded-lg px-3 py-2">
            <div className="text-[#6b7280] text-xs mb-1">Form (TSB)</div>
            <div className={`font-mono text-lg font-bold ${today.tsb >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {today.tsb > 0 ? '+' : ''}{today.tsb.toFixed(1)}
            </div>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={visible} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(visible.length / 6)}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
          <ReferenceLine y={0} stroke="#2a2a2a" strokeWidth={1} />
          <Bar dataKey="load" fill="#2a2a2a" radius={[2, 2, 0, 0]} maxBarSize={6} />
          <Line type="monotone" dataKey="ctl" stroke="#60a5fa" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="atl" stroke="#f97316" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="tsb" stroke="#34d399" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex gap-4 mt-2 text-xs text-[#6b7280]">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-400 inline-block" /> Fitness</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-orange-400 inline-block" /> Fatigue</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Form</span>
      </div>
    </div>
  )
}
