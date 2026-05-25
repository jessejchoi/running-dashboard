'use client'
import { formatTime } from '@/lib/analysis'
import { vdotFrom5K } from '@/lib/utils'
import { distanceLabel, type DistanceKey, distanceKm } from '@/lib/goals'
import type { CombinedEstimate } from '@/lib/analysis'
import type { EstimateDelta } from '@/lib/estimateSnapshots'

interface Props {
  distanceKey: DistanceKey
  combined: CombinedEstimate | null
  targetSecs?: number | null
  deltas?: EstimateDelta | null
}

function DeltaChip({ label, delta }: { label: string; delta: number | null }) {
  if (delta == null) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-mono text-[#4b5563]">{label}</span>
        <span className="text-xs text-[#4b5563]">—</span>
      </div>
    )
  }
  // Negative delta = faster (improved), positive = slower (regressed)
  const improved = delta < 0
  const same = delta === 0
  const abs = Math.abs(delta)
  const color = same ? '#6b7280' : improved ? '#10b981' : '#ef4444'
  const arrow = same ? '' : improved ? '▼' : '▲'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-mono text-[#4b5563]">{label}</span>
      <span className="text-xs font-mono font-bold" style={{ color }}>
        {same ? '—' : `${arrow} ${formatTime(abs)}`}
      </span>
    </div>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  interval: 'Intervals',
  threshold: 'Tempo',
  long_run: 'Long runs',
  easy_trend: 'Easy trend',
  race_result: 'Races',
}

export default function CombinedEstimateCard({ distanceKey, combined, targetSecs, deltas }: Props) {
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
  const confColor = confidence >= 0.85 ? 'text-[#b8d957] bg-[#b8d957]/10 border-[#b8d957]/20'
    : confidence >= 0.6 ? 'text-[#b8d957] bg-[#b8d957]/10 border-yellow-400/20'
    : 'text-[#dc8b3a] bg-[#dc8b3a]/10 border-[#dc8b3a]/20'

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
          <div className="stat-num text-2xl font-bold text-[#e84d85]">{formatTime(bestEstimateSecs)}</div>
        </div>
        <div>
          <div className="text-[#6b7280] text-xs mb-1">Pace</div>
          <div className="stat-num text-2xl font-bold text-white">{formatTime(paceSecPerKm)}/km</div>
        </div>
        {targetSecs && gapSecs != null && (
          <div>
            <div className="text-[#6b7280] text-xs mb-1">Gap to goal</div>
            <div className={`stat-num text-2xl font-bold ${gapSecs <= 0 ? 'text-[#b8d957]' : 'text-[#e84d85]'}`}>
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

      {/* Progress deltas */}
      <div className="flex items-center gap-4 pt-3 border-t border-[#1c1c1c]">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#4b5563] mr-1">Progress</span>
        <DeltaChip label="1w" delta={deltas?.week ?? null} />
        <DeltaChip label="1m" delta={deltas?.month ?? null} />
        <DeltaChip label="3m" delta={deltas?.quarter ?? null} />
      </div>
    </div>
  )
}
