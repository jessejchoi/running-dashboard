'use client'
import { formatTime } from '@/lib/analysis'
import { distanceShortLabel } from '@/lib/goals'
import { useAnalysisTab } from './AnalysisTabContext'

interface RaceEstimate {
  distanceKey: string
  estimatedSecs: number
}

interface Props {
  raceEstimates?: RaceEstimate[]
  fallbackSecs: number
  color: string
}

export default function RunEstimateBadge({ raceEstimates, fallbackSecs, color }: Props) {
  const { active } = useAnalysisTab()
  const match = raceEstimates?.find(r => r.distanceKey === active)
  const secs = match?.estimatedSecs ?? fallbackSecs

  return (
    <div className="text-right shrink-0">
      <div className="stat-num text-xl font-bold" style={{ color }}>{formatTime(secs)}</div>
      <div className="text-[#6b7280] text-xs">est. {distanceShortLabel(active)}</div>
    </div>
  )
}
