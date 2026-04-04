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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as LongRunAnalysis & { label: string; trend?: number }
  if (!d) return null
  const hmEst = d.raceEstimates?.find(r => r.distanceKey === 'hm')
  const fmEst = d.raceEstimates?.find(r => r.distanceKey === 'fm')
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs shadow-2xl max-w-[240px]">
      <div className="text-[#6b7280] mb-2">{format(new Date(d.date + 'T12:00:00'), 'MMM d, yyyy')}</div>
      <div className="font-display font-bold text-lg mb-0.5" style={{ color: COLOR }}>
        {formatPace(d.steadyPace)}/km
      </div>
      <div className="text-[#9ca3af] mb-2">@ {Math.round(d.steadyHR)} bpm · {d.distanceKm.toFixed(1)} km</div>
      {d.driftReliable ? (
        <div className={`mb-1 font-mono text-xs ${d.cardiacDrift > 3 ? 'text-orange-400' : 'text-emerald-400'}`}>
          Drift: {d.cardiacDrift.toFixed(1)}%
        </div>
      ) : (
        <div className="mb-1 text-[#4b5563] text-xs">Drift: —  {d.driftReason && `(${d.driftReason})`}</div>
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

  // Linear regression for trend line
  const n = data.length
  const xs = data.map((_, i) => i)
  const ys = data.map(d => d.steadyPace)
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
  const weeklyChangeSec = trendSlope * 1.5 // ~1.5 long runs/week

  const latestEst = latest.raceEstimates?.find(r => r.distanceKey === active)

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
          <div className="text-[#4b5563] text-xs mt-0.5">{latest.distanceKm.toFixed(1)} km run</div>
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
        {latestEst && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Est. {distanceLabel(active as DistanceKey)}</div>
            <div className="font-mono font-bold text-white">{formatTime(latestEst.estimatedSecs)}</div>
            <div className="text-[#4b5563] text-xs mt-0.5">from latest run</div>
          </div>
        )}
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
            dot={{ fill: COLOR, r: 5, strokeWidth: 2, stroke: '#0a0a0a' }}
            activeDot={{ r: 7, fill: COLOR, strokeWidth: 2, stroke: '#1c1c1c' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-[10px] text-[#4b5563] mt-2">
        Pace from last steady lap · drift compares ~30% mark vs last 15 min · only shown when pace is consistent (±10%)
      </div>
    </div>
  )
}
