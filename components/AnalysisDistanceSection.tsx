'use client'
import { type DistanceKey } from '@/lib/goals'
import type { CombinedEstimate } from '@/lib/analysis'
import type { AllDeltas } from '@/lib/estimateSnapshots'
import CombinedEstimateCard from './CombinedEstimateCard'
import Link from 'next/link'
import { useAnalysisTab } from './AnalysisTabContext'
import AnalysisDistanceToggle from './AnalysisDistanceToggle'

interface ExtrasMap {
  idealSecs: number | null
  todaySecs: number | null
  p80LowSecs: number | null
  p80HighSecs: number | null
}

interface Props {
  combined: Record<DistanceKey, CombinedEstimate | null>
  targetSecsMap: Record<string, number>
  allDeltas?: AllDeltas
  /** Per-distance extras from the CP engine. */
  extrasMap?: Record<string, ExtrasMap> | null
}

export default function AnalysisDistanceSection({ combined, targetSecsMap, allDeltas, extrasMap }: Props) {
  const { active } = useAnalysisTab()

  const c = combined[active]
  const targetSecs = targetSecsMap[active] ?? null
  const deltas = allDeltas?.[active] ?? null
  const extras = extrasMap?.[active] ?? null

  const sourceCount = c ? new Set(c.contributors.map(ct => ct.source)).size : 0

  return (
    <div>
      <AnalysisDistanceToggle />

      <div className="space-y-4">
        <CombinedEstimateCard distanceKey={active} combined={c} targetSecs={targetSecs} deltas={deltas} extras={extras} />

        {sourceCount > 0 && (
          <Link href="/analysis/sources" className="inline-flex items-center min-h-[44px] text-[#f97316] text-sm hover:underline">
            See run details →
          </Link>
        )}
      </div>
    </div>
  )
}
