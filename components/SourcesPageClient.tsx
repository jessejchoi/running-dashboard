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

const SOURCE_ORDER: EstimateSource[] = ['interval', 'threshold', 'easy_trend', 'race_result']

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

      {(active === 'hm' || active === 'fm') && c?.endurancePenaltyPct != null && c.endurancePenaltyPct > 0 && (
        <div className="mt-6 rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-amber-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Endurance readiness penalty: +{(c.endurancePenaltyPct * 100).toFixed(1)}%
              </p>
              <p className="text-[#6b7280] text-xs mt-1">
                Your longest run in the last 3 months is{' '}
                <span className="text-[#9ca3af]">{c.longestRecentRunKm != null ? `${c.longestRecentRunKm.toFixed(1)} km` : 'unknown'}</span>.
                {active === 'hm'
                  ? ' For half marathon estimates, this penalty phases out once you\'ve run 18 km+.'
                  : ' For marathon estimates, this penalty phases out once you\'ve run 35 km+.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
