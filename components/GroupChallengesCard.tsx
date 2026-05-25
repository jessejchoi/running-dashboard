'use client'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Trophy } from 'lucide-react'
import { useUnit } from '@/lib/unit-context'
import { metersToMiles } from '@/lib/utils'

interface MemberProgress {
  athlete_id: number
  name: string
  profile_pic: string | null
  is_me: boolean
  meters: number
}

interface Challenge {
  id: string
  name: string
  description: string | null
  challenge_type: string
  target_meters: number | null
  start_date: string
  end_date: string
  config: Record<string, unknown>
  total_meters: number
  pct: number
  by_member: MemberProgress[]
  created_by_coach: boolean
}

interface Props {
  groupId: string
}

function Avatar({ name, pic }: { name: string; pic: string | null }) {
  if (pic) {
    return <img src={pic} alt={name} className="w-5 h-5 rounded-full object-cover shrink-0" />
  }
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-5 h-5 rounded-full bg-[#e84d85]/20 flex items-center justify-center text-[#e84d85] font-bold text-[8px] shrink-0">
      {initials}
    </div>
  )
}

export default function GroupChallengesCard({ groupId }: Props) {
  const { unit } = useUnit()
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/groups/${groupId}/challenges`)
      .then(r => r.json())
      .then(d => setChallenges(d.challenges ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [groupId])

  function toDisplay(meters: number) {
    return unit === 'miles' ? metersToMiles(meters) : meters / 1000
  }
  const label = unit === 'miles' ? 'mi' : 'km'

  const active = challenges.filter(c => {
    const now = new Date()
    const start = new Date(`${c.start_date}T00:00:00`)
    const end = new Date(`${c.end_date}T23:59:59`)
    return start <= now && end >= now
  })
  const upcoming = challenges.filter(c => new Date(`${c.start_date}T00:00:00`) > new Date())

  if (loading) {
    return (
      <div className="card fade-up">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#1c1c1c] rounded w-1/3" />
          <div className="h-16 bg-[#1c1c1c] rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="card fade-up">
      <h3 className="font-display font-bold text-sm text-white mb-4">Challenges</h3>

      {active.length === 0 && upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Trophy size={20} className="text-[#303037]" />
          <p className="text-[#4b5563] text-xs text-center">No active challenges.<br />Head to the group page to create one.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {[...active, ...upcoming].map(c => {
            const isUpcoming = new Date(`${c.start_date}T00:00:00`) > new Date()
            const daysLeft = Math.ceil((new Date(`${c.end_date}T23:59:59`).getTime() - Date.now()) / 86400000)
            const daysToStart = Math.ceil((new Date(`${c.start_date}T00:00:00`).getTime() - Date.now()) / 86400000)
            const cType = c.challenge_type ?? 'group_distance'

            return (
              <div key={c.id}>
                {/* Challenge header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-bold text-sm text-white">{c.name}</span>
                      {c.created_by_coach && (
                        <span className="text-[10px] text-[#e84d85] font-bold bg-[#e84d85]/10 border border-[#e84d85]/20 px-1.5 py-0.5 rounded">✦ Coach</span>
                      )}
                      {isUpcoming ? (
                        <span className="text-[10px] text-[#6bbfdf] font-bold bg-[#6bbfdf]/10 px-1.5 py-0.5 rounded">Upcoming</span>
                      ) : (
                        <span className="text-[10px] text-[#b8d957] font-bold bg-[#b8d957]/10 px-1.5 py-0.5 rounded">Active</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#4b5563]">
                      {format(new Date(c.start_date + 'T12:00:00'), 'MMM d')} – {format(new Date(c.end_date + 'T12:00:00'), 'MMM d')}
                      {!isUpcoming && ` · ${daysLeft}d left`}
                      {isUpcoming && ` · starts in ${daysToStart}d`}
                    </p>
                  </div>
                  {cType === 'group_distance' && c.target_meters && (
                    <span className="text-sm font-mono font-bold text-[#e84d85] shrink-0">{c.pct}%</span>
                  )}
                </div>

                {/* group_distance */}
                {cType === 'group_distance' && c.target_meters && (
                  <>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] text-[#6b7280]">
                        {toDisplay(c.total_meters).toFixed(1)} / {toDisplay(c.target_meters).toFixed(0)} {label}
                      </span>
                    </div>
                    <div className="h-2 bg-[#1c1c1c] rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full transition-all duration-700 bg-[#e84d85]"
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                    {!isUpcoming && c.by_member.length > 0 && (
                      <div className="space-y-1.5">
                        {c.by_member.map(m => {
                          const memberPct = Math.min(100, (m.meters / c.target_meters!) * 100)
                          return (
                            <div key={m.athlete_id} className="flex items-center gap-2">
                              <Avatar name={m.name} pic={m.profile_pic} />
                              <span className={`text-xs w-14 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                                {m.is_me ? 'You' : m.name.split(' ')[0]}
                              </span>
                              <div className="flex-1 h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${memberPct}%`, background: m.is_me ? '#e84d85' : '#44413d' }}
                                />
                              </div>
                              <span className={`text-xs font-mono w-14 text-right ${m.is_me ? 'text-[#e84d85]' : 'text-[#6b7280]'}`}>
                                {toDisplay(m.meters).toFixed(1)} {label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* elevation */}
                {cType === 'elevation' && c.target_meters && (
                  <>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] text-[#6b7280]">
                        {Math.round(c.total_meters)}m / {Math.round(c.target_meters)}m elevation
                      </span>
                      <span className="text-sm font-mono font-bold text-[#e84d85] shrink-0">{c.pct}%</span>
                    </div>
                    <div className="h-2 bg-[#1c1c1c] rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all duration-700 bg-[#e84d85]" style={{ width: `${c.pct}%` }} />
                    </div>
                    {!isUpcoming && c.by_member.length > 0 && (
                      <div className="space-y-1.5">
                        {c.by_member.map(m => {
                          const memberPct = Math.min(100, (m.meters / c.target_meters!) * 100)
                          return (
                            <div key={m.athlete_id} className="flex items-center gap-2">
                              <Avatar name={m.name} pic={m.profile_pic} />
                              <span className={`text-xs w-14 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                                {m.is_me ? 'You' : m.name.split(' ')[0]}
                              </span>
                              <div className="flex-1 h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${memberPct}%`, background: m.is_me ? '#e84d85' : '#44413d' }} />
                              </div>
                              <span className={`text-xs font-mono w-14 text-right ${m.is_me ? 'text-[#e84d85]' : 'text-[#6b7280]'}`}>
                                {Math.round(m.meters)}m
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* run_count */}
                {cType === 'run_count' && c.target_meters && (
                  <>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] text-[#6b7280]">
                        {c.total_meters} / {Math.round(c.target_meters)} runs
                      </span>
                      <span className="text-sm font-mono font-bold text-[#e84d85] shrink-0">{c.pct}%</span>
                    </div>
                    <div className="h-2 bg-[#1c1c1c] rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all duration-700 bg-[#e84d85]" style={{ width: `${c.pct}%` }} />
                    </div>
                    {!isUpcoming && c.by_member.length > 0 && (
                      <div className="space-y-1.5">
                        {c.by_member.map((m, i) => (
                          <div key={m.athlete_id} className="flex items-center gap-2">
                            <span className="text-base w-5 text-center shrink-0">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-xs text-[#4b5563]">{i + 1}</span>}
                            </span>
                            <Avatar name={m.name} pic={m.profile_pic} />
                            <span className={`text-xs flex-1 truncate ${m.is_me ? 'text-white font-medium' : 'text-[#9ca3af]'}`}>
                              {m.is_me ? 'You' : m.name.split(' ')[0]}
                            </span>
                            <span className={`text-xs font-mono ${m.is_me ? 'text-[#e84d85]' : 'text-[#6b7280]'}`}>
                              {m.meters} run{m.meters !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* weekly_quota */}
                {cType === 'weekly_quota' && (() => {
                  const weeklyMeters = c.config['weekly_meters'] as number | undefined
                  if (!weeklyMeters) return null
                  return (
                    <p className="text-xs text-[#6b7280]">
                      Weekly quota: <span className="text-white font-mono font-bold">
                        {toDisplay(weeklyMeters).toFixed(0)} {label}
                      </span> / week
                      {!isUpcoming && c.by_member.length > 0 && (
                        <span className="ml-2 text-[#4b5563]">
                          · {c.by_member.length} member{c.by_member.length !== 1 ? 's' : ''} contributing
                        </span>
                      )}
                    </p>
                  )
                })()}

                {/* fastest_effort */}
                {cType === 'fastest_effort' && (
                  <p className="text-xs text-[#6b7280]">
                    Fastest manual lap or 1 km split — see group page for leaderboard
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
