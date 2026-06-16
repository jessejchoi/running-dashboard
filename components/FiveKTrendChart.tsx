'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts'
import { format } from 'date-fns'
import { formatTime, formatPace, riegelProject } from '@/lib/analysis'
import { useAnalysisTab } from './AnalysisTabContext'
import { distanceShortLabel, type DistanceKey } from '@/lib/goals'

const DISTANCE_KM: Record<DistanceKey, number> = {
  '5k': 5, '10k': 10, 'hm': 21.097, 'fm': 42.195,
}

const DEFAULT_TARGET_SECS: Record<DistanceKey, number> = {
  '5k': 22 * 60 + 30,
  '10k': 45 * 60,
  'hm': 1 * 3600 + 45 * 60,
  'fm': 3 * 3600 + 30 * 60,
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

function buildTooltip(color: string, dk: DistanceKey) {
  const km = DISTANCE_KM[dk]
  return function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const secs = d.displaySecs ?? d.estimatedSecs
    return (
      <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs shadow-2xl max-w-[220px]">
        <div className="text-[#6b7280] mb-2">{format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}</div>
        <div className="font-display font-bold text-lg mb-0.5" style={{ color }}>{formatTime(secs)}</div>
        <div className="font-mono mb-2 text-[#9ca3af]">{formatPace(secs / km)}/km</div>
        {dk === '5k' && d.vdot != null && !isNaN(d.vdot) && (
          <div className="text-blue-400 font-mono text-xs mb-2">VDOT {d.vdot.toFixed(1)}</div>
        )}
        <div className="text-[#6b7280] truncate">{d.activityName}</div>
        {d.effortsUsed && (
          <div className="text-[#4b5563] mt-1">{d.effortsUsed} effort{d.effortsUsed !== 1 ? 's' : ''} analysed</div>
        )}
      </div>
    )
  }
}

export default function FiveKTrendChart({ estimates, targetSecsMap, defaultTargetSecs, color = '#f97316' }: Props) {
  const { active } = useAnalysisTab()
  const km = DISTANCE_KM[active]
  const targetSecs = targetSecsMap[active] ?? DEFAULT_TARGET_SECS[active] ?? defaultTargetSecs

  // Map each estimate to the selected distance's time.
  const data = [...estimates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const raceEst = e.raceEstimates?.find(r => r.distanceKey === active)
      const displaySecs = raceEst?.estimatedSecs ?? (active === '5k' ? e.estimatedSecs : riegelProject(e.estimatedSecs, 5, km))
      return { ...e, displaySecs, label: format(new Date(e.date + 'T12:00:00'), 'MMM d') }
    })

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[#6b7280] text-sm">
        No sessions found. Tag your workouts to start seeing estimates.
      </div>
    )
  }

  const allSecs = [...data.map(d => d.displaySecs), targetSecs]
  const rawMinSecs = Math.min(...allSecs)
  const rawMaxSecs = Math.max(...allSecs)
  const paddingSecs = Math.max(60, (rawMaxSecs - rawMinSecs) * 0.12, targetSecs * 0.015)
  const minSecs = Math.max(0, rawMinSecs - paddingSecs)
  const maxSecs = rawMaxSecs + paddingSecs

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
  const label = distanceShortLabel(active)
  const yAxisWidth = active === 'fm' ? 66 : active === 'hm' ? 58 : 48

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6 mb-6 text-sm">
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Trend</div>
          <div className={`font-mono font-bold ${improving ? 'text-emerald-400' : 'text-red-400'}`}>
            {improving ? '▼' : '▲'} {formatTime(Math.abs(slope * 7))} / week
          </div>
          <div className="text-[#4b5563] text-xs mt-0.5">{improving ? 'improving' : 'getting slower'}</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Latest estimate</div>
          <div className="font-mono font-bold text-white">{formatTime(latest.displaySecs)}</div>
          <div className="text-[#4b5563] text-xs mt-0.5">est. {label} time</div>
        </div>
        {active === '5k' && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">VDOT</div>
            <div className="font-mono font-bold text-white">
              {latest.vdot && !isNaN(latest.vdot) ? latest.vdot.toFixed(1) : '—'}
            </div>
          </div>
        )}
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Gap to goal</div>
          <div className={`font-mono font-bold ${gapSecs <= 0 ? 'text-emerald-400' : ''}`} style={gapSecs > 0 ? { color } : {}}>
            {gapSecs <= 0 ? '✓ At goal' : `−${formatTime(gapSecs)}`}
          </div>
          {gapSecs > 0 && improving && (
            <div className="text-[#4b5563] text-xs mt-0.5">
              ~{Math.ceil(gapSecs / Math.abs(slope * 7))} weeks at current rate
            </div>
          )}
        </div>
        {data.length > 1 && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Total improvement</div>
            <div className={`font-mono font-bold ${data[0].displaySecs > latest.displaySecs ? 'text-emerald-400' : 'text-red-400'}`}>
              {data[0].displaySecs > latest.displaySecs ? '▼ ' : '▲ '}
              {formatTime(Math.abs(data[0].displaySecs - latest.displaySecs))}
            </div>
            <div className="text-[#4b5563] text-xs mt-0.5">over {data.length} sessions</div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#1a1a1a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[minSecs, maxSecs]}
            reversed
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickFormatter={formatTime}
            axisLine={false} tickLine={false}
            width={yAxisWidth}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={targetSecs}
            stroke="#f97316"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{ value: `Goal ${formatTime(targetSecs)}`, position: 'insideRight', fill: '#f97316', fontSize: 9, fontFamily: 'var(--font-mono)' }}
          />
          <Line type="monotone" dataKey="trend" stroke="#2a2a2a" strokeWidth={2} dot={false} strokeDasharray="4 3" />
          <Line
            type="monotone"
            dataKey="displaySecs"
            stroke={color}
            strokeWidth={2.5}
            dot={{ fill: color, r: 5, strokeWidth: 2, stroke: '#0a0a0a' }}
            activeDot={{ r: 7, fill: color, strokeWidth: 2, stroke: '#1c1c1c' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
