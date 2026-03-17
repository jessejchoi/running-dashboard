'use client'
import { useState } from 'react'
import { type DistanceKey, distanceLabel } from '@/lib/goals'
import type { CombinedEstimate, EstimateSource } from '@/lib/analysis'
import CombinedEstimateCard from './CombinedEstimateCard'
import SourceCard from './SourceCard'

const TABS: { key: DistanceKey; label: string }[] = [
  { key: '5k', label: '5K' },
  { key: '10k', label: '10K' },
  { key: 'hm', label: 'HM' },
  { key: 'fm', label: 'FM' },
]

const SOURCE_ORDER: EstimateSource[] = ['race_result', 'interval', 'threshold', 'long_run', 'easy_trend']

interface Props {
  combined: Record<DistanceKey, CombinedEstimate | null>
  allEstimates: { distanceKey: DistanceKey; source: EstimateSource; estimatedSecs: number; weight: number; date: string; activityId: number; method: string }[]
  targetSecsMap: Record<string, number>
}

export default function AnalysisDistanceSection({ combined, allEstimates, targetSecsMap }: Props) {
  const [active, setActive] = useState<DistanceKey>('5k')

  const c = combined[active]
  const targetSecs = targetSecsMap[active] ?? null

  // Group estimates by source for this distance
  const distEstimates = allEstimates.filter(e => e.distanceKey === active)
  const bySource: Record<string, typeof distEstimates> = {}
  for (const e of distEstimates) {
    if (!bySource[e.source]) bySource[e.source] = []
    bySource[e.source].push(e)
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

      <div className="space-y-6">
        <CombinedEstimateCard distanceKey={active} combined={c} targetSecs={targetSecs} />

        {Object.keys(bySource).length > 0 && (
          <div>
            <h3 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest mb-4">Contributing Sources</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {SOURCE_ORDER.map(source => {
                if (!bySource[source]) return null
                return <SourceCard key={source} source={source} contributors={bySource[source]} />
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
