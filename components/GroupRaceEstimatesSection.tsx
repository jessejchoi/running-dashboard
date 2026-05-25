'use client'
import { type Member, Avatar, formatTime } from '@/components/GroupShared'
import { useUnit } from '@/lib/unit-context'
import { paceUnitLabel } from '@/lib/utils'

interface Props {
  members: Member[]
  initialEstimates: Record<number, Record<string, number>>
  myAthleteId: number
}

const DISTANCES = [
  { key: '5k',  label: '5K',            km: 5,       color: 'text-[#e84d85]',    border: 'border-[#e84d85]/20' },
  { key: '10k', label: '10K',           km: 10,      color: 'text-[#dc8b3a]', border: 'border-[#dc8b3a]/20' },
  { key: 'hm',  label: 'Half Marathon', km: 21.0975, color: 'text-[#6bbfdf]',    border: 'border-sky-400/20' },
  { key: 'fm',  label: 'Marathon',      km: 42.195,  color: 'text-[#6bbfdf]', border: 'border-[#6bbfdf]/20' },
]

function paceStr(secs: number, km: number, unit: 'km' | 'miles') {
  const secsPerUnit = (secs / km) * (unit === 'miles' ? 1.60934 : 1)
  const m = Math.floor(secsPerUnit / 60)
  const s = Math.round(secsPerUnit % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function MemberRow({ member, secs, km, unit, isMe }: {
  member: Member
  secs: number
  km: number
  unit: 'km' | 'miles'
  isMe: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 py-2 border-b border-[#202024] last:border-0 ${isMe ? 'opacity-100' : 'opacity-90'}`}>
      <Avatar name={member.name} pic={member.profile_pic} size={6} />
      <span className={`flex-1 text-xs font-bold truncate ${isMe ? 'text-[#e84d85]' : 'text-white'}`}>
        {member.name.split(' ')[0]}
      </span>
      <div className="text-right shrink-0">
        <div className="font-mono text-white text-xs font-bold">{formatTime(secs)}</div>
        <div className="font-mono text-[#4b5563] text-[10px]">{paceStr(secs, km, unit)}{paceUnitLabel(unit)}</div>
      </div>
    </div>
  )
}

export default function GroupRaceEstimatesSection({ members, initialEstimates, myAthleteId }: Props) {
  const { unit } = useUnit()
  const estimates = initialEstimates

  const cardsToShow = DISTANCES.filter(d =>
    members.some(m => estimates[m.athlete_id]?.[d.key] != null)
  )

  if (cardsToShow.length === 0) return null

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">
          Race Estimates
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cardsToShow.map(dist => {
          const entries = members
            .filter(m => estimates[m.athlete_id]?.[dist.key] != null)
            .map(m => ({ member: m, secs: estimates[m.athlete_id][dist.key] }))
            .sort((a, b) => a.secs - b.secs)

          return (
            <div key={dist.key} className={`bg-[#111] border ${dist.border} rounded-xl p-3`}>
              <div className={`text-[10px] font-bold font-display uppercase tracking-widest mb-3 ${dist.color}`}>
                {dist.label}
              </div>
              {entries.length === 0 ? (
                <p className="text-[#44413d] text-[10px]">No estimates yet</p>
              ) : (
                <div>
                  {entries.map(({ member, secs }) => (
                    <MemberRow
                      key={member.athlete_id}
                      member={member}
                      secs={secs}
                      km={dist.km}
                      unit={unit}
                      isMe={member.athlete_id === myAthleteId}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
