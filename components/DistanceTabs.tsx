'use client'
import { useState, type ReactNode } from 'react'
import { type DistanceKey } from '@/lib/goals'

const TABS: { key: DistanceKey; label: string }[] = [
  { key: '5k', label: '5K' },
  { key: '10k', label: '10K' },
  { key: 'hm', label: 'HM' },
  { key: 'fm', label: 'FM' },
]

interface Props {
  children: (activeTab: DistanceKey) => ReactNode
  defaultTab?: DistanceKey
}

export default function DistanceTabs({ children, defaultTab = '5k' }: Props) {
  const [active, setActive] = useState<DistanceKey>(defaultTab)

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
      {children(active)}
    </div>
  )
}
