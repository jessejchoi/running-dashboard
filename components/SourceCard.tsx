'use client'
import { formatTime } from '@/lib/analysis'
import type { EstimateSource, DistanceKey } from '@/lib/analysis'

interface Contributor {
  source: EstimateSource
  estimatedSecs: number
  weight?: number
  confidence?: number
  date: string
  activityId: number
  method: string
}

interface Props {
  source: EstimateSource
  contributors: Contributor[]
  distanceKey: DistanceKey
  sourceAverage?: number
  /** Effective weight (0 if missing, redistributed from combiner) */
  effectiveWeight?: number
}

const SOURCE_CONFIG: Record<EstimateSource, { label: string; color: string; icon: string; emptyHint: string }> = {
  interval: { label: 'Intervals', color: '#ff1d6c', icon: '⚡', emptyHint: 'Tag interval workouts to generate estimates' },
  threshold: { label: 'Tempo', color: '#5ad7ff', icon: '🔥', emptyHint: 'Tag tempo runs to generate estimates' },
  long_run: { label: 'Long Runs', color: '#d9ff36', icon: '🏃', emptyHint: 'Needs 12km+ runs with heart rate data' },
  easy_trend: { label: 'Aerobic Efficiency', color: '#5ad7ff', icon: '📈', emptyHint: 'Need 3+ easy runs in the last 6 weeks' },
  race_result: { label: 'Race Results', color: '#ff1d6c', icon: '🏆', emptyHint: 'No races detected yet' },
}

const DISTANCE_HINTS: Partial<Record<EstimateSource, Partial<Record<DistanceKey, string>>>> = {
  long_run: {
    '5k': 'Long runs don\u2019t directly predict 5K times',
    '10k': 'Long runs contribute minimally to 10K estimates',
  },
  easy_trend: {
    '5k': 'Easy pace doesn\u2019t directly predict 5K times',
  },
}

export default function SourceCard({ source, contributors, distanceKey, sourceAverage, effectiveWeight }: Props) {
  const config = SOURCE_CONFIG[source]

  const weightPct = Math.round((effectiveWeight ?? 0) * 100)

  // Empty state
  if (!contributors.length) {
    const hint = DISTANCE_HINTS[source]?.[distanceKey] ?? config.emptyHint
    return (
      <div className="card fade-up opacity-50" style={{ borderLeft: `3px solid ${config.color}40` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg opacity-40">{config.icon}</span>
            <div>
              <h3 className="font-display font-bold text-sm text-[#4b5563]">{config.label}</h3>
              <p className="text-[#4b5563] text-[10px]">No data</p>
            </div>
          </div>
          <div className="text-right">
            <div className="stat-num text-lg font-bold text-[#333]">--:--</div>
            <div className="text-[10px] text-[#4b5563]">
              {weightPct}% weight
            </div>
          </div>
        </div>
        <p className="text-[#4b5563] text-xs mt-3">{hint}</p>
      </div>
    )
  }

  const avgSecs = sourceAverage ?? contributors[0].estimatedSecs
  const sorted = [...contributors].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="card fade-up" style={{ borderLeft: `3px solid ${config.color}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <div>
            <h3 className="font-display font-bold text-sm" style={{ color: config.color }}>{config.label}</h3>
            <p className="text-[#4b5563] text-[10px]">{contributors.length} data point{contributors.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="stat-num text-lg font-bold text-white">{formatTime(avgSecs)}</div>
          <div className="text-[10px]" style={{ color: config.color }}>
            {weightPct}% weight
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {sorted.slice(0, 5).map((c, i) => {
          // Extract drift note from method string if present
          const driftMatch = c.method.match(/\((?:rep drift|excess drift|avg excess drift)\s*([+-]?\d+\.?\d*)%/)
          const driftExcess = driftMatch ? parseFloat(driftMatch[1]) : null
          const methodBase = driftMatch ? c.method.slice(0, c.method.lastIndexOf(' (')).trimEnd() : c.method
          return (
            <div key={`${c.activityId}-${i}`} className="flex items-center justify-between text-xs bg-[#111] rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <span className="text-[#6b7280] font-mono">{c.date}</span>
                <span className="text-[#4b5563] ml-2 truncate">{methodBase}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {driftExcess != null && (
                  <span className={`text-[10px] font-mono font-bold ${driftExcess > 1 ? 'text-[#ff7a1c]' : driftExcess < -0.5 ? 'text-[#d9ff36]' : 'text-[#4b5563]'}`}>
                    drift {driftExcess > 0 ? '+' : ''}{driftExcess.toFixed(1)}%
                  </span>
                )}
                <span className="font-mono font-bold text-white">{formatTime(c.estimatedSecs)}</span>
              </div>
            </div>
          )
        })}
        {sorted.length > 5 && (
          <div className="text-[#4b5563] text-[10px] px-3">
            +{sorted.length - 5} more
          </div>
        )}
      </div>
    </div>
  )
}
