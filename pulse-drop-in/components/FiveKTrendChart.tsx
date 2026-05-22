'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts'
import { format } from 'date-fns'
import { formatTime, formatPace } from '@/lib/analysis'
import { useAnalysisTab } from './AnalysisTabContext'
import { distanceLabel, type DistanceKey } from '@/lib/goals'

const DISTANCE_KM: Record<DistanceKey, number> = {
  '5k': 5, '10k': 10, 'hm': 21.097, 'fm': 42.195,
}

export interface TrendPoint {
  date: string
  activityId: number
  activityName: string
  estimatedSecs: number
  vdot: number
  effortsUsed?: number
  raceEstimates?: { distanceKey: string; estimatedSecs: number }[]
  [key: string]: any
}

interface Props {
  estimates: TrendPoint[]
  targetSecsMap: Record<string, number>
  defaultTargetSecs: number
  color?: string
}

const ACID  = '#d9ff36'
const FG_3  = '#6a6a6a'
const FG_4  = '#424242'
const INK_1 = '#111111'

function buildTooltip(color: string, dk: DistanceKey) {
  const km = DISTANCE_KM[dk]
  return function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const secs = d.displaySecs ?? d.estimatedSecs
    return (
      <div className="px-4 py-3 text-xs max-w-[220px]" style={{ background: INK_1, border: '1px solid rgba(255,255,255,0.22)' }}>
        <div className="font-mono uppercase tracking-[0.16em] text-[10px] mb-2" style={{ color: FG_3 }}>{format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}</div>
        <div className="font-display font-bold text-xl uppercase mb-0.5" style={{ color, letterSpacing: '-0.02em' }}>{formatTime(secs)}</div>
        <div className="font-mono mb-2" style={{ color: '#b4b4b4' }}>{formatPace(secs / km)}/km</div>
        {dk === '5k' && d.vdot != null && !isNaN(d.vdot) && (
          <div className="font-mono text-xs mb-2" style={{ color: '#5ad7ff' }}>VDOT {d.vdot.toFixed(1)}</div>
        )}
        <div className="font-mono truncate" style={{ color: FG_3 }}>{d.activityName}</div>
        {d.effortsUsed && (
          <div className="font-mono mt-1 text-[10px]" style={{ color: FG_4 }}>{d.effortsUsed} effort{d.effortsUsed !== 1 ? 's' : ''} analysed</div>
        )}
      </div>
    )
  }
}

export default function FiveKTrendChart({ estimates, targetSecsMap, defaultTargetSecs, color = '#ff1d6c' }: Props) {
  const { active } = useAnalysisTab()
  const km = DISTANCE_KM[active]
  const targetSecs = targetSecsMap[active] ?? defaultTargetSecs

  const data = [...estimates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const raceEst = e.raceEstimates?.find(r => r.distanceKey === active)
      const displaySecs = raceEst?.estimatedSecs ?? e.estimatedSecs
      return { ...e, displaySecs, label: format(new Date(e.date + 'T12:00:00'), 'MMM d') }
    })

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 font-mono text-xs uppercase tracking-[0.16em]" style={{ color: FG_3 }}>
        No sessions found. Tag your workouts to start seeing estimates.
      </div>
    )
  }

  const allSecs = data.map(d => d.displaySecs)
  const minSecs = Math.min(...allSecs, targetSecs) - 45
  const maxSecs = Math.max(...allSecs) + 60

  const n = data.length
  const xs = data.map((_, i) => i)
  const ys = data.map(d => d.displaySecs)
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)
  const denom = n * sumX2 - sumX * sumX
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n

  const trendData = data.map((d, i) => ({
    ...d,
    trend: parseFloat((intercept + slope * i).toFixed(1)),
  }))

  const improving = slope < 0
  const latest = data[data.length - 1]
  const gapSecs = latest.displaySecs - targetSecs
  const CustomTooltip = buildTooltip(color, active)
  const label = distanceLabel(active)

  const trendColor = improving ? ACID : '#ff1d6c'

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6 mb-6 text-sm">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: FG_3 }}>TREND</div>
          <div className="font-mono font-bold" style={{ color: trendColor }}>
            {improving ? '▼' : '▲'} {formatTime(Math.abs(slope * 7))} / week
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] mt-0.5" style={{ color: FG_4 }}>{improving ? 'improving' : 'getting slower'}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: FG_3 }}>LATEST</div>
          <div className="font-mono font-bold" style={{ color: '#f4f4f4' }}>{formatTime(latest.displaySecs)}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] mt-0.5" style={{ color: FG_4 }}>est. {label} time</div>
        </div>
        {active === '5k' && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: FG_3 }}>VDOT</div>
            <div className="font-mono font-bold" style={{ color: '#f4f4f4' }}>
              {latest.vdot && !isNaN(latest.vdot) ? latest.vdot.toFixed(1) : '—'}
            </div>
          </div>
        )}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: FG_3 }}>GAP TO GOAL</div>
          <div className="font-mono font-bold" style={{ color: gapSecs <= 0 ? ACID : color }}>
            {gapSecs <= 0 ? '✓ At goal' : `−${formatTime(gapSecs)}`}
          </div>
          {gapSecs > 0 && improving && (
            <div className="font-mono text-[10px] mt-0.5" style={{ color: FG_4 }}>
              ~{Math.ceil(gapSecs / Math.abs(slope * 7))} weeks at current rate
            </div>
          )}
        </div>
        {data.length > 1 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: FG_3 }}>TOTAL IMPROVEMENT</div>
            <div className="font-mono font-bold" style={{ color: data[0].displaySecs > latest.displaySecs ? ACID : '#ff1d6c' }}>
              {data[0].displaySecs > latest.displaySecs ? '▼ ' : '▲ '}
              {formatTime(Math.abs(data[0].displaySecs - latest.displaySecs))}
            </div>
            <div className="font-mono text-[10px] mt-0.5" style={{ color: FG_4 }}>over {data.length} sessions</div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: FG_3, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[minSecs, maxSecs]}
            reversed
            tick={{ fill: FG_3, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickFormatter={formatTime}
            axisLine={false} tickLine={false}
            width={46}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={targetSecs}
            stroke={color}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{ value: `Goal ${formatTime(targetSecs)}`, position: 'insideTopRight', fill: color, fontSize: 9, fontFamily: 'var(--font-mono)' }}
          />
          <Line type="monotone" dataKey="trend" stroke="rgba(255,255,255,0.22)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
          <Line
            type="monotone"
            dataKey="displaySecs"
            stroke={color}
            strokeWidth={2.5}
            dot={{ fill: color, r: 5, strokeWidth: 2, stroke: '#0a0a0a' }}
            activeDot={{ r: 7, fill: color, strokeWidth: 2, stroke: '#0a0a0a' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
