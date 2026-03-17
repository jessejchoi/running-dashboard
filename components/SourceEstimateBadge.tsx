'use client'
import { formatTime } from '@/lib/analysis'
import type { CombinedEstimate, EstimateSource } from '@/lib/analysis'
import { type DistanceKey, distanceLabel } from '@/lib/goals'
import { useAnalysisTab } from './AnalysisTabContext'

interface Props {
  combined: Record<DistanceKey, CombinedEstimate | null>
  source: EstimateSource
  color: string
  label: string
}

export default function SourceEstimateBadge({ combined, source, color, label }: Props) {
  const { active } = useAnalysisTab()
  const secs = combined[active]?.sourceAverages?.[source]

  if (!secs) return null

  return (
    <div className="text-right">
      <div className="stat-num text-xl font-bold" style={{ color }}>{formatTime(secs)}</div>
      <div className="text-[#4b5563] text-[10px]">est. {distanceLabel(active)} from {label}</div>
    </div>
  )
}
