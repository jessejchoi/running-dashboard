'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { formatPace } from '@/lib/analysis'
import type { EasyRunEfficiency } from '@/lib/analysis'
import { vdotFrom5K } from '@/lib/utils'

const COLOR = '#5ad7ff'
const REF_HR = 150

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as EasyRunEfficiency & { label: string; trend?: number; runKind?: string; steadyDurationSecs?: number }
  if (!d) return null
  const isLong = (d as any).runKind === 'long_steady'
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs shadow-2xl max-w-[220px]">
      <div className="text-[#6b7280] mb-2">{format(parseISO(d.date), 'MMM d, yyyy')}</div>
      <div className="flex items-center gap-2 mb-1">
        <div className="font-display font-bold text-lg" style={{ color: COLOR }}>
          {formatPace(d.normalizedPaceSec)}/km
        </div>
        {isLong && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: COLOR, background: `${COLOR}20` }}>
            long run
          </span>
        )}
      </div>
      <div className="text-[#9ca3af] mb-2">
        {isLong
          ? `steady portion · ${d.steadyDurationSecs ? Math.round((d as any).steadyDurationSecs / 60) : '?'} min`
          : `at ${REF_HR} bpm ref HR`}
      </div>
      <div className="text-[#6b7280]">
        Actual: {formatPace(d.avgPaceSecPerKm)}/km @ {Math.round(d.avgHR)} bpm
      </div>
      {d.r2 > 0 && (
        <div className="text-[#4b5563] mt-1">Regression R²={d.r2.toFixed(2)}</div>
      )}
      <div className="text-[#4b5563] mt-1 truncate">{d.activityName}</div>
    </div>
  )
}

interface Props {
  runs: EasyRunEfficiency[]
}

export default function AerobicEfficiencyChart({ runs }: Props) {
  const data = [...runs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ ...e, label: format(parseISO(e.date), 'MMM d') }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[#6b7280] text-sm">
        No runs found. Tag your easy runs to start tracking efficiency.
      </div>
    )
  }

  const allPaces = data.map(d => d.normalizedPaceSec)
  const minPace = Math.min(...allPaces) - 10
  const maxPace = Math.max(...allPaces) + 20

  const n = data.length
  const xs = data.map((_, i) => i)
  const ys = data.map(d => d.normalizedPaceSec)
  const sumX  = xs.reduce((a, b) => a + b, 0)
  const sumY  = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)
  const denom = n * sumX2 - sumX * sumX
  const trendSlope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const trendIntercept = (sumY - trendSlope * sumX) / n

  const trendData = data.map((d, i) => ({
    ...d,
    trend: parseFloat((trendIntercept + trendSlope * i).toFixed(1)),
  }))

  const improving = trendSlope < 0
  const latest = data[data.length - 1]
  const weeklyChangeSec = trendSlope * 3

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6 mb-6 text-sm">
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Trend</div>
          <div className={`font-mono font-bold ${improving ? 'text-[#d9ff36]' : 'text-[#ff1d6c]'}`}>
            {improving ? '▼' : '▲'} {Math.abs(weeklyChangeSec).toFixed(1)}s/km · week
          </div>
          <div className="text-[#4b5563] text-xs mt-0.5">{improving ? 'getting faster' : 'getting slower'}</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Latest @ {REF_HR} bpm</div>
          <div className="font-mono font-bold text-white">{formatPace(latest.normalizedPaceSec)}/km</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Est. VDOT</div>
          <div className="font-mono font-bold text-white">{vdotFrom5K(latest.normalizedPaceSec * 5)}</div>
          <div className="text-[#4b5563] text-xs mt-0.5">from aerobic efficiency</div>
        </div>
        {data.length > 1 && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Total improvement</div>
            <div className={`font-mono font-bold ${data[0].normalizedPaceSec > latest.normalizedPaceSec ? 'text-[#d9ff36]' : 'text-[#ff1d6c]'}`}>
              {data[0].normalizedPaceSec > latest.normalizedPaceSec ? '▼ ' : '▲ '}
              {Math.abs(data[0].normalizedPaceSec - latest.normalizedPaceSec).toFixed(1)}s/km
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
            domain={[minPace, maxPace]}
            reversed
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickFormatter={formatPace}
            axisLine={false} tickLine={false}
            width={46}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="trend" stroke="#2a2a2a" strokeWidth={2} dot={false} strokeDasharray="4 3" />
          <Line
            type="monotone"
            dataKey="normalizedPaceSec"
            stroke={COLOR}
            strokeWidth={2.5}
            dot={{ fill: COLOR, r: 5, strokeWidth: 2, stroke: '#0a0a0a' }}
            activeDot={{ r: 7, fill: COLOR, strokeWidth: 2, stroke: '#1c1c1c' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-[10px] text-[#4b5563] mt-2">
        Pace normalised to {REF_HR} bpm · 45 min reference · duration credit applied
      </div>
    </div>
  )
}
