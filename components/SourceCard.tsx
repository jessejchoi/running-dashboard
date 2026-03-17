'use client'
import { formatTime, getSourceWeight } from '@/lib/analysis'
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
  /** The combiner's aggregated estimate for this source (after drop-slowest + recency) */
  sourceAverage?: number
}

const SOURCE_CONFIG: Record<EstimateSource, { label: string; color: string; icon: string; emptyHint: string }> = {
  interval: { label: 'Intervals', color: '#f97316', icon: '⚡', emptyHint: 'Tag interval workouts to generate estimates' },
  threshold: { label: 'Threshold', color: '#60a5fa', icon: '🔥', emptyHint: 'Tag tempo/threshold runs to generate estimates' },
  long_run: { label: 'Long Runs', color: '#34d399', icon: '🏃', emptyHint: 'Tag long runs to generate estimates' },
  easy_trend: { label: 'Easy Trend', color: '#a78bfa', icon: '📈', emptyHint: 'Need 3+ easy runs in the last 6 weeks' },
  race_result: { label: 'Race Results', color: '#f472b6', icon: '🏆', emptyHint: 'No races detected yet' },
}

export default function SourceCard({ source, contributors, distanceKey, sourceAverage }: Props) {
  const config = SOURCE_CONFIG[source]

  const fixedWeight = getSourceWeight(distanceKey, source)
  const weightPct = Math.round(fixedWeight * 100)

  // Empty state
  if (!contributors.length) {
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
        <p className="text-[#4b5563] text-xs mt-3">{config.emptyHint}</p>
      </div>
    )
  }

  // Use the combiner's aggregated estimate if available, otherwise fall back to simple average
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
        {sorted.slice(0, 5).map((c, i) => (
          <div key={`${c.activityId}-${i}`} className="flex items-center justify-between text-xs bg-[#111] rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <span className="text-[#6b7280] font-mono">{c.date}</span>
              <span className="text-[#4b5563] ml-2 truncate">{c.method}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <span className="font-mono font-bold text-white">{formatTime(c.estimatedSecs)}</span>
            </div>
          </div>
        ))}
        {sorted.length > 5 && (
          <div className="text-[#4b5563] text-[10px] px-3">
            +{sorted.length - 5} more
          </div>
        )}
      </div>
    </div>
  )
}
