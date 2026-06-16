'use client'
import { formatTime, riegelProject } from '@/lib/analysis'
import { speedToPace, formatDuration, formatDistanceShort, paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { distanceShortLabel, type DistanceKey } from '@/lib/goals'
import { useAnalysisTab } from './AnalysisTabContext'

const DISTANCE_KM: Record<DistanceKey, number> = {
  '5k': 5, '10k': 10, 'hm': 21.097, 'fm': 42.195,
}

const DEFAULT_TARGET_SECS: Record<DistanceKey, number> = {
  '5k': 22 * 60 + 30,
  '10k': 45 * 60,
  'hm': 1 * 3600 + 45 * 60,
  'fm': 3 * 3600 + 30 * 60,
}

interface Props {
  efforts: any[]
  targetSecsMap: Record<string, number>
  defaultTargetSecs: number
  unit: DistanceUnit
}

export default function RepTableClient({ efforts, targetSecsMap, defaultTargetSecs, unit }: Props) {
  const { active } = useAnalysisTab()
  const targetSecs = targetSecsMap[active] ?? DEFAULT_TARGET_SECS[active] ?? defaultTargetSecs
  const km = DISTANCE_KM[active]
  const activeLabel = distanceShortLabel(active)

  if (efforts.length === 0) return null

  return (
    <div className="bg-[#111] rounded-lg overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1c1c1c]">
            {['Lap', 'Dist', 'Pace', 'Time', 'HR', `Est. ${activeLabel}`].map(h => (
              <th key={h} className="text-left px-2 py-2 text-[#4b5563] font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {efforts.map((rep: any, i: number) => {
            const projectedSecs = active === '5k'
              ? rep.correctedSecs
              : riegelProject(rep.correctedSecs, 5, km)
            return (
              <tr key={i} className="border-b border-[#1a1a1a]">
                <td className="px-2 py-2 text-[#6b7280] font-mono">{rep.lapIndex}</td>
                <td className="px-2 py-2 font-mono text-white whitespace-nowrap">
                  {rep.distanceM >= 1000 ? formatDistanceShort(rep.distanceM, unit) : `${Math.round(rep.distanceM)}m`}
                </td>
                <td className="px-2 py-2 font-mono font-bold text-white whitespace-nowrap">{speedToPace(1000/rep.paceSecPerKm, unit)}{paceUnitLabel(unit)}</td>
                <td className="px-2 py-2 font-mono text-[#9ca3af] whitespace-nowrap">{formatDuration(rep.durationSecs)}</td>
                <td className="px-2 py-2 font-mono text-[#9ca3af]">{rep.avgHR ? Math.round(rep.avgHR) : '—'}</td>
                <td className={`px-2 py-2 font-mono font-bold whitespace-nowrap ${projectedSecs <= targetSecs ? 'text-emerald-400' : 'text-white'}`}>
                  {formatTime(projectedSecs)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[10px] text-[#4b5563]">
        Est. {activeLabel} = rep pace adjusted for rest, duration, and HR
      </div>
    </div>
  )
}
