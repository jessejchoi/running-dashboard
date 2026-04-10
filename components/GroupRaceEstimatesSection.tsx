'use client'
import { type Member, Avatar, formatTime } from '@/components/GroupShared'
import { useUnit } from '@/lib/unit-context'
import { paceUnitLabel } from '@/lib/utils'

interface Props {
  members: Member[]
  memberEstimates: Record<number, Record<string, number>>
  myAthleteId: number
}

const DISTANCE_CONFIG = [
  { key: '5k',  label: '5K',            km: 5,       color: 'text-red-400',    bar: 'bg-red-400',    bg: 'bg-red-400/10' },
  { key: '10k', label: '10K',           km: 10,      color: 'text-orange-400', bar: 'bg-orange-400', bg: 'bg-orange-400/10' },
  { key: 'hm',  label: 'Half Marathon', km: 21.0975, color: 'text-sky-400',    bar: 'bg-sky-400',    bg: 'bg-sky-400/10' },
  { key: 'fm',  label: 'Marathon',      km: 42.195,  color: 'text-purple-400', bar: 'bg-purple-400', bg: 'bg-purple-400/10' },
]

function paceStr(secs: number, km: number, unit: 'km' | 'miles') {
  const secsPerKm = secs / km
  const secsPerUnit = unit === 'miles' ? secsPerKm * 1.60934 : secsPerKm
  const m = Math.floor(secsPerUnit / 60)
  const s = Math.round(secsPerUnit % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function GroupRaceEstimatesSection({ members, memberEstimates, myAthleteId }: Props) {
  const { unit } = useUnit()

  // Check which distance cards have at least one member with an estimate
  const cardsToShow = DISTANCE_CONFIG.filter(dist =>
    members.some(m => memberEstimates[m.athlete_id]?.[dist.key] != null)
  )

  if (cardsToShow.length === 0) return null

  return (
    <div className="mt-8">
      <h3 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-4">
        Race Estimates
      </h3>
      <div className="space-y-4">
        {cardsToShow.map(dist => {
          // Collect members with estimates for this distance, sorted fastest first
          const entries = members
            .filter(m => memberEstimates[m.athlete_id]?.[dist.key] != null)
            .map(m => ({ member: m, secs: memberEstimates[m.athlete_id][dist.key] }))
            .sort((a, b) => a.secs - b.secs)

          const fastest = entries[0]?.secs ?? 0
          const slowest = entries[entries.length - 1]?.secs ?? 0
          const range = slowest - fastest || 1

          return (
            <div key={dist.key} className="card">
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-sm font-bold font-display uppercase tracking-wider ${dist.color}`}>{dist.label}</span>
                <span className="text-[#3a3a3a] text-xs">·</span>
                <span className="text-[#4b5563] text-xs">{entries.length} athlete{entries.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="space-y-3">
                {entries.map(({ member, secs }, i) => {
                  const isMe = member.athlete_id === myAthleteId
                  const barWidth = fastest === slowest ? 100 : Math.round(100 - ((secs - fastest) / range) * 75)

                  return (
                    <div key={member.athlete_id} className="flex items-center gap-3">
                      {/* Rank */}
                      <div className="w-5 shrink-0 text-right">
                        <span className="text-[10px] font-mono font-bold text-[#4b5563]">{i + 1}</span>
                      </div>

                      {/* Avatar + Name */}
                      <Avatar name={member.name} pic={member.profile_pic} size={6} />
                      <div className="w-20 shrink-0">
                        <span className={`text-xs font-bold truncate block leading-tight ${isMe ? 'text-[#f97316]' : 'text-white'}`}>
                          {member.name.split(' ')[0]}
                          {isMe && <span className="text-[9px] text-[#f97316]/70 ml-1">you</span>}
                        </span>
                      </div>

                      {/* Bar + time */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#1c1c1c] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${dist.bar}`}
                              style={{ width: `${barWidth}%`, opacity: isMe ? 1 : 0.6 }}
                            />
                          </div>
                          <span className="font-mono text-white text-xs font-bold shrink-0 w-16 text-right">
                            {formatTime(secs)}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#4b5563] font-mono mt-0.5 text-right">
                          {paceStr(secs, dist.km, unit)}{paceUnitLabel(unit)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
