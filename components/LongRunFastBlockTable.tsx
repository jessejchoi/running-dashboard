'use client'

import { formatPace, formatTime, type FastBlock, type RaceEstimate } from '@/lib/analysis'
import { formatDuration } from '@/lib/utils'
import { distanceShortLabel } from '@/lib/goals'
import { useAnalysisTab } from './AnalysisTabContext'

interface Props {
  blocks: FastBlock[]
  primaryStartSec?: number
  estimates?: RaceEstimate[]
  fatigueCredit?: number
}

export default function LongRunFastBlockTable({ blocks, primaryStartSec, estimates, fatigueCredit }: Props) {
  const { active } = useAnalysisTab()
  const activeLabel = distanceShortLabel(active)

  if (blocks.length === 0) return null

  return (
    <div className="bg-[#111] rounded-lg overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1c1c1c]">
            {['Block', 'Pace', 'Duration', 'HR', `Est. ${activeLabel}`].map(h => (
              <th key={h} className="text-left px-3 py-2 text-[#4b5563] font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, i) => {
            const isPrimary = block.startSec === primaryStartSec
            const activeEstimate = isPrimary ? estimates?.find(e => e.distanceKey === active) : undefined
            return (
              <tr key={i} className="border-b border-[#1a1a1a]">
                <td className="px-3 py-2 font-mono text-[#6b7280] whitespace-nowrap">
                  min {Math.round(block.startSec / 60)}-{Math.round(block.endSec / 60)}
                  {isPrimary && blocks.length > 1 && <span className="ml-1 text-[10px] text-blue-400">*</span>}
                </td>
                <td className="px-3 py-2 font-mono font-bold text-[#60a5fa] whitespace-nowrap">{formatPace(block.avgPace)}/km</td>
                <td className="px-3 py-2 font-mono text-white whitespace-nowrap">{formatDuration(block.durationSecs)}</td>
                <td className="px-3 py-2 font-mono text-[#9ca3af] whitespace-nowrap">{block.avgHR > 0 ? `${Math.round(block.avgHR)} bpm` : '-'}</td>
                <td className="px-3 py-2 font-mono text-white whitespace-nowrap">{activeEstimate ? formatTime(activeEstimate.estimatedSecs) : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {fatigueCredit != null && fatigueCredit > 0 && (
        <div className="px-3 py-2 text-[10px] text-[#4b5563]">
          * = primary block used for estimates · Est. {activeLabel} uses +{fatigueCredit.toFixed(1)}s/km fatigue credit
        </div>
      )}
    </div>
  )
}
