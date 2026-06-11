'use client'
import { type DistanceKey } from '@/lib/goals'
import type { CombinedEstimate } from '@/lib/analysis'
import type { AllDeltas } from '@/lib/estimateSnapshots'
import CombinedEstimateCard from './CombinedEstimateCard'
import Link from 'next/link'
import { useAnalysisTab } from './AnalysisTabContext'

const TABS: { key: DistanceKey; label: string }[] = [
  { key: '5k', label: '5K' },
  { key: '10k', label: '10K' },
  { key: 'hm', label: 'HM' },
  { key: 'fm', label: 'FM' },
]

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
  const { active, setActive } = useAnalysisTab()

  const c = combined[active]
  const targetSecs = targetSecsMap[active] ?? null
  const deltas = allDeltas?.[active] ?? null
  const extras = extrasMap?.[active] ?? null

  const sourceCount = c ? new Set(c.contributors.map(ct => ct.source)).size : 0

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-[#111] rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${
              active === tab.key
                ? 'bg-[#f97316] text-white shadow-lg'
                : 'text-[#6b7280] hover:text-white hover:bg-[#1c1c1c]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <CombinedEstimateCard distanceKey={active} combined={c} targetSecs={targetSecs} deltas={deltas} extras={extras} />

        {sourceCount > 0 && (
          <Link href="/analysis/sources" className="inline-flex items-center min-h-[44px] text-[#f97316] text-sm hover:underline">
            View sources →
          </Link>
        )}
      </div>
    </div>
  )
}
