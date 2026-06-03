'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { format } from 'date-fns'
import { formatPace, formatTime, type LongRunAnalysis } from '@/lib/analysis'
import { useAnalysisTab } from './AnalysisTabContext'
import { distanceLabel, type DistanceKey } from '@/lib/goals'

const COLOR = '#34d399'

const STRUCTURE_LABEL: Record<string, string> = {
  steady:      'Steady',
  progression: 'Progression',
  fast_middle: 'Long run fast block',
}
const STRUCTURE_COLOR: Record<string, string> = {
  steady:      '#6b7280',
  progression: '#f97316',
  fast_middle: '#60a5fa',
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as LongRunAnalysis & { label: string; trend?: number }
  if (!d) return null
  // Prefer steady HM/FM estimates for tooltip (first ones found = steady projection)
  const hmEst = d.raceEstimates?.find(r => r.distanceKey === 'hm')
  const fmEst = d.raceEstimates?.find(r => r.distanceKey === 'fm')
  const structColor = STRUCTURE_COLOR[d.runStructure] ?? '#6b7280'
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs shadow-2xl max-w-[250px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#6b7280]">{format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}</span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ color: structColor, background: `${structColor}20` }}>
          {STRUCTURE_LABEL[d.runStructure]}
        </span>
      </div>
      <div className="font-display font-bold text-lg mb-0.5" style={{ color: COLOR }}>
        {formatPace(d.steadyPace)}/km
      </div>
      <div className="text-[#9ca3af] mb-2">@ {Math.round(d.steadyHR)} bpm · {d.distanceKm.toFixed(1)} km</div>
      {d.driftReliable ? (
        <div className={`mb-1 font-mono text-xs ${d.cardiacDrift > 3 ? 'text-orange-400' : 'text-emerald-400'}`}>
          Drift: {d.cardiacDrift.toFixed(1)}%
        </div>
      ) : (
        <div className="mb-1 text-[#4b5563] text-xs">Drift: — {d.driftReason && `(${d.driftReason})`}</div>
      )}
      {d.fastBlock && (
        <div className="mt-1 mb-1 text-[#60a5fa] text-xs font-mono">
          Fast block: {(d.fastBlock.durationSecs / 60).toFixed(0)} min @ {formatPace(d.fastBlock.avgPace)}/km
        </div>
      )}
      {d.residualElevation != null && (
        <div className={`mb-1 text-xs font-mono ${d.residualElevation > 5 ? 'text-orange-400' : 'text-emerald-400'}`}>
          Residual HR: +{d.residualElevation.toFixed(1)}%
        </div>
      )}
      {hmEst && <div className="text-[#9ca3af]">HM est. {formatTime(hmEst.estimatedSecs)}</div>}
      {fmEst && <div className="text-[#9ca3af]">FM est. {formatTime(fmEst.estimatedSecs)}</div>}
      <div className="text-[#4b5563] mt-1 truncate">{d.activityName}</div>
    </div>
  )
}

export default function LongRunChart({ runs }: { runs: LongRunAnalysis[] }) {
  const { active } = useAnalysisTab()

  const data = [...runs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ ...e, label: format(new Date(e.date + 'T12:00:00'), 'MMM d') }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[#6b7280] text-sm">
        No long runs found. Tag your runs as Long to start tracking.
      </div>
    )
  }

  const allPaces = data.map(d => d.steadyPace)
  const minPace = Math.min(...allPaces) - 10
  const maxPace = Math.max(...allPaces) + 20

  const n = data.length
  const xs = data.map((_, i) => i)
  const ys = data.map(d => d.steadyPace)
  const sumX  = xs.reduce((a, b) => a + b, 0)
  const sumY  = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)
  const denom = n * sumX2 - sumX * sumX
  const trendSlope     = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const trendIntercept = (sumY - trendSlope * sumX) / n

  const trendData = data.map((d, i) => ({
    ...d,
    trend: parseFloat((trendIntercept + trendSlope * i).toFixed(1)),
  }))

  const improving = trendSlope < 0
  const latest    = data[data.length - 1]
  const weeklyChangeSec = trendSlope * 1.5

  const latestFastEst = latest.fastBlockEstimates?.find(r => r.distanceKey === active)
  // When a fast block exists, raceEstimates already equals fastBlockEstimates,
  // so show it as the primary est. For steady runs, find the steady-method entry.
  const latestSteadyEst = latestFastEst
    ? null
    : (latest.raceEstimates?.find(r => r.distanceKey === active && r.method?.startsWith('Steady'))
       ?? latest.raceEstimates?.find(r => r.distanceKey === active))

  // Custom dot renderer — colour by run structure
  const renderDot = (props: any) => {
    const { cx, cy, payload } = props
    const c = STRUCTURE_COLOR[payload.runStructure] ?? COLOR
    return <circle key={payload.activityId} cx={cx} cy={cy} r={5} fill={c} stroke="#0a0a0a" strokeWidth={2} />
  }

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
          <div className="text-[#6b7280] text-xs mb-1">Latest pace</div>
          <div className="font-mono font-bold text-white">{formatPace(latest.steadyPace)}/km</div>
          <div className="text-[#4b5563] text-xs mt-0.5">
            {latest.distanceKm.toFixed(1)} km ·{' '}
            <span style={{ color: STRUCTURE_COLOR[latest.runStructure] }}>
              {STRUCTURE_LABEL[latest.runStructure]}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Cardiac drift</div>
          {latest.driftReliable ? (
            <>
              <div className={`font-mono font-bold ${latest.cardiacDrift > 3 ? 'text-orange-400' : 'text-emerald-400'}`}>
                {latest.cardiacDrift.toFixed(1)}%
              </div>
              <div className="text-[#4b5563] text-xs mt-0.5">{latest.cardiacDrift > 3 ? 'high fatigue' : 'low fatigue'}</div>
            </>
          ) : (
            <>
              <div className="font-mono font-bold text-[#4b5563]">—</div>
              <div className="text-[#4b5563] text-xs mt-0.5">unreliable</div>
            </>
          )}
        </div>
        {latest.residualElevation != null && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Residual HR</div>
            <div className={`font-mono font-bold ${latest.residualElevation > 5 ? 'text-orange-400' : 'text-emerald-400'}`}>
              +{latest.residualElevation.toFixed(1)}%
            </div>
            <div className="text-[#4b5563] text-xs mt-0.5">post-effort easy HR</div>
          </div>
        )}
        {latestFastEst ? (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Est. {distanceLabel(active as DistanceKey)}</div>
            <div className="font-mono font-bold text-[#60a5fa]">{formatTime(latestFastEst.estimatedSecs)}</div>
            <div className="text-[#4b5563] text-xs mt-0.5">from long run fast block</div>
          </div>
        ) : latestSteadyEst ? (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Est. {distanceLabel(active as DistanceKey)}</div>
            <div className="font-mono font-bold text-white">{formatTime(latestSteadyEst.estimatedSecs)}</div>
            <div className="text-[#4b5563] text-xs mt-0.5">from steady pace</div>
          </div>
        ) : null}
        {data.length > 1 && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Total improvement</div>
            <div className={`font-mono font-bold ${data[0].steadyPace > latest.steadyPace ? 'text-emerald-400' : 'text-red-400'}`}>
              {data[0].steadyPace > latest.steadyPace ? '▼ ' : '▲ '}
              {Math.abs(data[0].steadyPace - latest.steadyPace).toFixed(1)}s/km
            </div>
            <div className="text-[#4b5563] text-xs mt-0.5">over {data.length} runs</div>
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
            dataKey="steadyPace"
            stroke={COLOR}
            strokeWidth={2.5}
            dot={renderDot}
            activeDot={{ r: 7, fill: COLOR, strokeWidth: 2, stroke: '#1c1c1c' }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 text-[10px] text-[#4b5563]">
        <span>Dots: <span style={{ color: STRUCTURE_COLOR.steady }}>● steady</span>{' '}
          <span style={{ color: STRUCTURE_COLOR.progression }}>● progression</span>{' '}
          <span style={{ color: STRUCTURE_COLOR.fast_middle }}>● long run fast block</span>
        </span>
        <span>Drift compares ~30% mark vs last 15 min of steady portion · ±10% pace tolerance</span>
      </div>
    </div>
  )
}
