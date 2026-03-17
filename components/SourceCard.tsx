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
}

const SOURCE_CONFIG: Record<EstimateSource, { label: string; color: string; icon: string }> = {
  interval: { label: 'Intervals', color: '#f97316', icon: '⚡' },
  threshold: { label: 'Threshold', color: '#60a5fa', icon: '🔥' },
  long_run: { label: 'Long Runs', color: '#34d399', icon: '🏃' },
  easy_trend: { label: 'Easy Trend', color: '#a78bfa', icon: '📈' },
  race_result: { label: 'Race Results', color: '#f472b6', icon: '🏆' },
}

export default function SourceCard({ source, contributors, distanceKey }: Props) {
  const config = SOURCE_CONFIG[source]
  if (!contributors.length) return null

  // Weighted average estimate from this source
  const getWeight = (c: Contributor) => c.weight ?? c.confidence ?? 1
  const totalWeight = contributors.reduce((s, c) => s + getWeight(c), 0)
  const avgSecs = totalWeight > 0
    ? contributors.reduce((s, c) => s + c.estimatedSecs * getWeight(c), 0) / totalWeight
    : contributors[0].estimatedSecs

  const sorted = [...contributors].sort((a, b) => b.date.localeCompare(a.date))

  const fixedWeight = getSourceWeight(distanceKey, source)
  const weightPct = Math.round(fixedWeight * 100)

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
              <span className="font-mono text-[#4b5563] text-[10px]">w={getWeight(c).toFixed(2)}</span>
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
