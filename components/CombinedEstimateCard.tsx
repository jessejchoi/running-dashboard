'use client'
import { formatTime } from '@/lib/analysis'
import { vdotFrom5K } from '@/lib/utils'
import { distanceLabel, type DistanceKey, distanceKm } from '@/lib/goals'
import type { CombinedEstimate } from '@/lib/analysis'

interface Props {
  distanceKey: DistanceKey
  combined: CombinedEstimate | null
  targetSecs?: number | null
}

const SOURCE_LABELS: Record<string, string> = {
  interval: 'Intervals',
  threshold: 'Tempo',
  long_run: 'Long runs',
  easy_trend: 'Easy trend',
  race_result: 'Races',
}

export default function CombinedEstimateCard({ distanceKey, combined, targetSecs }: Props) {
  if (!combined) {
    return (
      <div className="card flex items-center justify-center py-10 text-[#6b7280] text-sm">
        No data available for {distanceLabel(distanceKey)}. Tag more workouts to see estimates.
      </div>
    )
  }

  const { bestEstimateSecs, confidence, contributors } = combined
  const km = distanceKm(distanceKey)
  const paceSecPerKm = bestEstimateSecs / km
  const vdot = distanceKey === '5k' ? vdotFrom5K(bestEstimateSecs) : vdotFrom5K(bestEstimateSecs / Math.pow(km / 5, 1.06) * 1)

  const confLabel = confidence >= 0.85 ? 'High' : confidence >= 0.6 ? 'Medium' : 'Low'
  const confColor = confidence >= 0.85 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
    : confidence >= 0.6 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
    : 'text-orange-400 bg-orange-400/10 border-orange-400/20'

  const sourceTypes = new Set(contributors.map(c => c.source))
  const gapSecs = targetSecs ? bestEstimateSecs - targetSecs : null

  return (
    <div className="card glow-orange fade-up" style={{ padding: '1.5rem' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-white">{distanceLabel(distanceKey)} Estimate</h2>
          <p className="text-[#4b5563] text-xs mt-0.5">{contributors.length} data point{contributors.length !== 1 ? 's' : ''} from {sourceTypes.size} source{sourceTypes.size !== 1 ? 's' : ''}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${confColor}`}>
          {confLabel} confidence
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Best estimate</div>
          <div className="stat-num text-2xl font-bold text-[#f97316]">{formatTime(bestEstimateSecs)}</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Pace</div>
          <div className="stat-num text-2xl font-bold text-white">{formatTime(paceSecPerKm)}/km</div>
        </div>
        {targetSecs && gapSecs != null && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Gap to goal</div>
            <div className={`stat-num text-2xl font-bold ${gapSecs <= 0 ? 'text-emerald-400' : 'text-[#f97316]'}`}>
              {gapSecs <= 0 ? 'At goal' : `−${formatTime(gapSecs)}`}
            </div>
          </div>
        )}
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Sources</div>
          <div className="flex flex-wrap gap-1">
            {Array.from(sourceTypes).map(src => (
              <span key={src} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#9ca3af]">
                {SOURCE_LABELS[src] ?? src}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
