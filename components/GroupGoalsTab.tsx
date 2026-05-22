'use client'

import { format } from 'date-fns'
import { paceUnitLabel } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'
import { Avatar, type Member } from '@/components/GroupShared'
import GroupRaceEstimatesSection from '@/components/GroupRaceEstimatesSection'

interface Goal {
  id: string
  athlete_id: number
  distance_key: string
  label: string
  target_secs: number
  current_secs: number | null
  race_date: string
}

interface Props {
  members: Member[]
  memberEstimates: Record<number, Record<string, number>>
  myAthleteId: number
}

function formatPace(secs: number) {
  const rounded = Math.round(secs)
  return `${Math.floor(rounded / 60)}:${(rounded % 60).toString().padStart(2, '0')}`
}

export default function GroupGoalsTab({ members, memberEstimates, myAthleteId }: Props) {
  const { unit } = useUnit()

  return (
    <>
      <div className="space-y-6 fade-up">
        {members.map((member) => (
          <div key={member.athlete_id}>
            <div className="flex items-center gap-2 mb-3">
              <Avatar name={member.name} pic={member.profile_pic} size={6} />
              <span className="font-bold text-sm">{member.name}</span>
              {member.is_me && <span className="text-[10px] text-[#ff1d6c] font-bold bg-[#ff1d6c]/10 px-1.5 py-0.5 rounded">You</span>}
            </div>
            {member.goals.length === 0 ? (
              <p className="text-[#4b5563] text-xs pl-8">No goals set yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-8">
                {member.goals.map((goal: Goal) => {
                  const daysLeft = Math.ceil((new Date(goal.race_date).getTime() - Date.now()) / 86400000)
                  const isPast = daysLeft < 0
                  const km = { '5k': 5, '10k': 10, 'half_marathon': 21.0975, 'hm': 21.0975, 'marathon': 42.195, 'fm': 42.195 }[goal.distance_key] ?? 5
                  const targetPace = goal.target_secs / km

                  const distColor = ({
                    '5k': 'text-[#ff1d6c]', '10k': 'text-[#ff7a1c]',
                    'half_marathon': 'text-[#5ad7ff]', 'hm': 'text-[#5ad7ff]',
                    'marathon': 'text-[#5ad7ff]', 'fm': 'text-[#5ad7ff]',
                  } as Record<string, string>)[goal.distance_key] ?? 'text-[#ff1d6c]'
                  const distBar = ({
                    '5k': 'bg-[#ff1d6c]', '10k': 'bg-[#ff7a1c]',
                    'half_marathon': 'bg-[#5ad7ff]', 'hm': 'bg-[#5ad7ff]',
                    'marathon': 'bg-[#5ad7ff]', 'fm': 'bg-[#5ad7ff]',
                  } as Record<string, string>)[goal.distance_key] ?? 'bg-[#ff1d6c]'
                  const distBg = ({
                    '5k': 'bg-[#ff1d6c]/10', '10k': 'bg-[#ff7a1c]/10',
                    'half_marathon': 'bg-[#5ad7ff]/10', 'hm': 'bg-[#5ad7ff]/10',
                    'marathon': 'bg-[#5ad7ff]/10', 'fm': 'bg-[#5ad7ff]/10',
                  } as Record<string, string>)[goal.distance_key] ?? 'bg-[#ff1d6c]/10'

                  const estimateKey = ({ 'half_marathon': 'hm', 'marathon': 'fm' } as Record<string, string>)[goal.distance_key] ?? goal.distance_key
                  const analysisSecs = memberEstimates[member.athlete_id]?.[estimateKey] ?? null
                  const currentSecs = analysisSecs ?? goal.current_secs ?? null
                  const currentPace = currentSecs ? currentSecs / km : null
                  const baselinePace = goal.current_secs ? goal.current_secs / km : targetPace + 30
                  const progress = (currentPace && baselinePace > targetPace)
                    ? Math.min(1, Math.max(0, (baselinePace - currentPace) / (baselinePace - targetPace)))
                    : 0
                  const unitAdjusted = (pace: number) => pace * (unit === 'miles' ? 1.60934 : 1)

                  return (
                    <div key={goal.id} className="bg-[#111] border border-[#1c1c1c] rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-bold text-sm leading-tight">{goal.label}</div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${distColor} ${distBg}`}>
                          {({ '5k': '5K', '10k': '10K', 'half_marathon': 'HM', 'hm': 'HM', 'marathon': 'FM', 'fm': 'FM' } as Record<string, string>)[goal.distance_key] ?? goal.distance_key.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[#6b7280] text-xs mb-2">
                        {isPast ? 'Past race' : `${daysLeft}d away`} · {format(new Date(goal.race_date), 'MMM d yyyy')}
                      </div>
                      <div className="flex gap-3 text-xs mb-2">
                        <div>
                          <div className="text-[#4b5563] mb-0.5">Target</div>
                          <div className={`font-mono font-bold ${distColor}`}>{formatPace(targetPace)}{paceUnitLabel(unit)}</div>
                        </div>
                        {currentPace && (
                          <div>
                            <div className="text-[#4b5563] mb-0.5">{analysisSecs ? 'Est.' : 'Current'}</div>
                            <div className="font-mono text-white font-bold">{formatPace(unitAdjusted(currentPace))}{paceUnitLabel(unit)}</div>
                          </div>
                        )}
                      </div>
                      <div className="h-1 bg-[#242424] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${distBar} transition-all duration-700`} style={{ width: `${progress * 100}%` }} />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] font-mono text-[#3a3a3a]">{formatPace(unitAdjusted(baselinePace))}</span>
                        <span className="text-[9px] font-mono text-[#3a3a3a]">{formatPace(unitAdjusted(targetPace))}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <GroupRaceEstimatesSection members={members} initialEstimates={memberEstimates} myAthleteId={myAthleteId} />
    </>
  )
}
