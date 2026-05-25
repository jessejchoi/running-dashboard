'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { type TrainingLoadPoint } from '@/lib/strava'
import { format, parseISO, subDays } from 'date-fns'

interface Props { data: TrainingLoadPoint[]; days?: number }

// ── Pulse color mapping ───────────────────────────────────────────────
const C_CTL = '#6bbfdf'   // ice — fitness (informational)
const C_ATL = '#e84d85'   // magenta — fatigue (effort)
const C_TSB = '#b8d957'   // acid — form (positive)
const FG_3  = '#8b837c'
const FG_4  = '#5d5651'
const INK_1 = '#151517'
const INK_2 = '#202024'

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const ctl  = payload.find((p: any) => p.dataKey === 'ctl')
  const atl  = payload.find((p: any) => p.dataKey === 'atl')
  const tsb  = payload.find((p: any) => p.dataKey === 'tsb')
  const load = payload.find((p: any) => p.dataKey === 'load')

  return (
    <div className="px-3 py-2 text-xs space-y-1" style={{ background: INK_1, border: '1px solid rgba(241,237,232,0.18)' }}>
      <div className="font-mono uppercase tracking-[0.16em] text-[10px] mb-1" style={{ color: FG_3 }}>{label}</div>
      {load?.value > 0 && <div className="font-mono text-[10px]" style={{ color: FG_4 }}>DAILY LOAD <span className="font-bold" style={{ color: '#f1ede8' }}>{load.value}</span></div>}
      <div className="font-mono" style={{ color: C_CTL }}>FITNESS <span className="font-bold">{ctl?.value?.toFixed(1)}</span></div>
      <div className="font-mono" style={{ color: C_ATL }}>FATIGUE <span className="font-bold">{atl?.value?.toFixed(1)}</span></div>
      <div className="font-mono" style={{ color: C_TSB }}>FORM <span className="font-bold">{tsb?.value?.toFixed(1)}</span></div>
    </div>
  )
}

export default function TrainingLoadChart({ data, days = 90 }: Props) {
  const cutoff = subDays(new Date(), days).toISOString().split('T')[0]
  const visible = data
    .filter(d => d.date >= cutoff)
    .map(d => ({ ...d, label: format(parseISO(d.date), 'MMM d') }))

  const today = data[data.length - 1]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {today && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="px-3 py-1.5" style={{ background: INK_2 }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] mb-0.5" style={{ color: FG_3 }}>FITNESS (CTL)</div>
            <div className="font-mono font-bold text-base" style={{ color: C_CTL }}>{today.ctl.toFixed(1)}</div>
          </div>
          <div className="px-3 py-1.5" style={{ background: INK_2 }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] mb-0.5" style={{ color: FG_3 }}>FATIGUE (ATL)</div>
            <div className="font-mono font-bold text-base" style={{ color: C_ATL }}>{today.atl.toFixed(1)}</div>
          </div>
          <div className="px-3 py-1.5" style={{ background: INK_2 }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] mb-0.5" style={{ color: FG_3 }}>FORM (TSB)</div>
            <div className="font-mono font-bold text-base" style={{ color: C_TSB }}>
              {today.tsb > 0 ? '+' : ''}{today.tsb.toFixed(1)}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visible} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: FG_3, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false} tickLine={false}
              interval={Math.floor(visible.length / 6)}
            />
            <YAxis
              tick={{ fill: FG_3, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
            <ReferenceLine y={0} stroke="rgba(241,237,232,0.10)" strokeWidth={1} />
            <Line type="monotone" dataKey="ctl" stroke={C_CTL} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="atl" stroke={C_ATL} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="tsb" stroke={C_TSB} strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
