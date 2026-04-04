'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { formatPace } from '@/lib/analysis'
import type { EasyRunEfficiency } from '@/lib/analysis'
import { vdotFrom5K } from '@/lib/utils'

const COLOR_EASY = '#a78bfa'
const COLOR_LONG = '#34d399'
const REF_HR = 150

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as EasyRunEfficiency & { label: string; trend?: number; runKind?: string; steadyDurationSecs?: number }
  if (!d) return null
  const isLong = (d as any).runKind === 'long_steady'
  const color = isLong ? COLOR_LONG : COLOR_EASY
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs shadow-2xl max-w-[220px]">
      <div className="text-[#6b7280] mb-2">{format(parseISO(d.date), 'MMM d, yyyy')}</div>
      <div className="flex items-center gap-2 mb-1">
        <div className="font-display font-bold text-lg" style={{ color }}>
          {formatPace(d.normalizedPaceSec)}/km
        </div>
        {isLong && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: COLOR_LONG, background: `${COLOR_LONG}20` }}>
            long run
          </span>
        )}
      </div>
      <div className="text-[#9ca3af] mb-2">
        {isLong
          ? `steady portion · ${d.steadyDurationSecs ? Math.round(d.steadyDurationSecs / 60) : '?'} min credit`
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
  longRunPoints?: EasyRunEfficiency[]
}

export default function AerobicEfficiencyChart({ runs, longRunPoints = [] }: Props) {
  // Sort each series by date, then combine for trend computation
  const easyData = [...runs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ ...e, label: format(parseISO(e.date), 'MMM d'), runKind: 'easy' }))

  const longData = [...longRunPoints]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ ...e, label: format(parseISO(e.date), 'MMM d') }))

  // Combined sorted for trend line (covers the full date range)
  const allData = [...easyData, ...longData].sort((a, b) => a.date.localeCompare(b.date))

  if (allData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[#6b7280] text-sm">
        No runs found. Tag your easy runs to start tracking efficiency.
      </div>
    )
  }

  // Shared Y-axis domain across both series
  const allPaces = allData.map(d => d.normalizedPaceSec)
  const minPace = Math.min(...allPaces) - 10
  const maxPace = Math.max(...allPaces) + 20

  // Linear regression trend from the combined dataset
  const n = allData.length
  const xs = allData.map((_, i) => i)
  const ys = allData.map(d => d.normalizedPaceSec)
  const sumX  = xs.reduce((a, b) => a + b, 0)
  const sumY  = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)
  const denom = n * sumX2 - sumX * sumX
  const trendSlope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const trendIntercept = (sumY - trendSlope * sumX) / n

  // Attach trend value to each point by its index in the combined sorted array
  const trendMap = new Map<string, number>()
  allData.forEach((d, i) => {
    trendMap.set(`${d.activityId}`, parseFloat((trendIntercept + trendSlope * i).toFixed(1)))
  })

  const easyTrendData = easyData.map(d => ({ ...d, trend: trendMap.get(`${d.activityId}`) }))
  const longTrendData = longData.map(d => ({ ...d, trend: trendMap.get(`${d.activityId}`) }))
  // Trend line uses allData with trend values
  const trendLineData = allData.map((d, i) => ({ ...d, trend: parseFloat((trendIntercept + trendSlope * i).toFixed(1)) }))

  const improving = trendSlope < 0
  const latest = allData[allData.length - 1]
  // Weekly improvement: slope per session, convert ~3 aerobic sessions/week
  const weeklyChangeSec = trendSlope * 3

  // For VDOT display, use the most recent easy run if available, else most recent point
  const latestEasy = easyData.length > 0 ? easyData[easyData.length - 1] : null

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6 mb-6 text-sm">
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Trend</div>
          <div className={`font-mono font-bold ${improving ? 'text-emerald-400' : 'text-red-400'}`}>
            {improving ? '▼' : '▲'} {Math.abs(weeklyChangeSec).toFixed(1)}s/km · week
          </div>
          <div className="text-[#4b5563] text-xs mt-0.5">{improving ? 'getting faster' : 'getting slower'}</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Latest @ {REF_HR} bpm</div>
          <div className="font-mono font-bold text-white">{formatPace(latest.normalizedPaceSec)}/km</div>
          {(latest as any).runKind === 'long_steady' && (
            <div className="text-[#4b5563] text-xs mt-0.5" style={{ color: COLOR_LONG }}>long run steady</div>
          )}
        </div>
        {latestEasy && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Est. VDOT</div>
            <div className="font-mono font-bold text-white">{vdotFrom5K(latestEasy.normalizedPaceSec * 5)}</div>
            <div className="text-[#4b5563] text-xs mt-0.5">from aerobic efficiency</div>
          </div>
        )}
        {allData.length > 1 && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Total improvement</div>
            <div className={`font-mono font-bold ${allData[0].normalizedPaceSec > latest.normalizedPaceSec ? 'text-emerald-400' : 'text-red-400'}`}>
              {allData[0].normalizedPaceSec > latest.normalizedPaceSec ? '▼ ' : '▲ '}
              {Math.abs(allData[0].normalizedPaceSec - latest.normalizedPaceSec).toFixed(1)}s/km
            </div>
            <div className="text-[#4b5563] text-xs mt-0.5">over {allData.length} sessions</div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#1a1a1a" vertical={false} />
          <XAxis
            dataKey="label"
            allowDuplicatedCategory={false}
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
          {/* Trend line across combined dataset */}
          <Line
            data={trendLineData}
            type="monotone"
            dataKey="trend"
            stroke="#2a2a2a"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 3"
          />
          {/* Easy run dots — filled purple */}
          <Line
            data={easyTrendData}
            type="monotone"
            dataKey="normalizedPaceSec"
            stroke={COLOR_EASY}
            strokeWidth={2.5}
            dot={{ fill: COLOR_EASY, r: 5, strokeWidth: 2, stroke: '#0a0a0a' }}
            activeDot={{ r: 7, fill: COLOR_EASY, strokeWidth: 2, stroke: '#1c1c1c' }}
            connectNulls={false}
          />
          {/* Long run steady dots — hollow emerald */}
          {longTrendData.length > 0 && (
            <Line
              data={longTrendData}
              type="monotone"
              dataKey="normalizedPaceSec"
              stroke={COLOR_LONG}
              strokeWidth={0}
              dot={{ fill: 'transparent', r: 5, strokeWidth: 2, stroke: COLOR_LONG }}
              activeDot={{ r: 7, fill: 'transparent', strokeWidth: 2, stroke: COLOR_LONG }}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-[10px] text-[#4b5563] mt-2">
        Pace normalised to {REF_HR} bpm · 45 min reference · duration credit applied · <span style={{ color: COLOR_EASY }}>●</span> easy run · <span style={{ color: COLOR_LONG }}>○</span> long run steady portion
      </div>
    </div>
  )
}
