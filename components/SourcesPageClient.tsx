'use client'
import { useState } from 'react'
import { type DistanceKey } from '@/lib/goals'
import type { CombinedEstimate, EstimateSource } from '@/lib/analysis'
import SourceCard from './SourceCard'

const TABS: { key: DistanceKey; label: string }[] = [
  { key: '5k', label: '5K' },
  { key: '10k', label: '10K' },
  { key: 'hm', label: 'HM' },
  { key: 'fm', label: 'FM' },
]

const SOURCE_ORDER: EstimateSource[] = ['interval', 'threshold', 'long_run', 'easy_trend', 'race_result']

interface Props {
  combined: Record<DistanceKey, CombinedEstimate | null>
  targetSecsMap: Record<string, number>
}

export default function SourcesPageClient({ combined }: Props) {
  const [active, setActive] = useState<DistanceKey>('5k')

  const c = combined[active]

  const bySource: Record<string, NonNullable<CombinedEstimate['contributors']>> = {}
  if (c) {
    for (const contrib of c.contributors) {
      if (!bySource[contrib.source]) bySource[contrib.source] = []
      bySource[contrib.source].push(contrib)
    }
  }

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-[#111] rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              active === tab.key
                ? 'bg-[#f97316] text-white shadow-lg'
                : 'text-[#6b7280] hover:text-white hover:bg-[#1c1c1c]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SOURCE_ORDER.map(source => (
          <SourceCard
            key={source}
            source={source}
            contributors={bySource[source] ?? []}
            distanceKey={active}
            sourceAverage={c?.sourceAverages?.[source]}
            effectiveWeight={c?.effectiveWeights?.[source] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
