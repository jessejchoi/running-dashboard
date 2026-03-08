'use client'
import { useState } from 'react'
import { differenceInDays, format } from 'date-fns'
import { formatGoalTime, paceSecs, distanceKm, type UserGoal, type DistanceKey } from '@/lib/goals'

interface MemberGoal extends UserGoal {
  athlete_name: string
  athlete_profile: string | null
}

interface Props {
  memberGoals: MemberGoal[]
}

function paceStr(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Avatar({ name, pic }: { name: string; pic: string | null }) {
  if (pic) return <img src={pic} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0" />
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-7 h-7 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-[10px] shrink-0">
      {initials}
    </div>
  )
}

function CompactGoalRow({ goal }: { goal: MemberGoal }) {
  const daysLeft = differenceInDays(new Date(goal.race_date), new Date())
  const isPast = daysLeft < 0
  const targetPace = paceSecs(goal.target_secs, goal.distance_key as DistanceKey)
  const statusColor = isPast ? 'text-[#4b5563]' : daysLeft <= 14 ? 'text-yellow-400' : 'text-emerald-400'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#1c1c1c] last:border-0">
      <Avatar name={goal.athlete_name} pic={goal.athlete_profile} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-white text-xs font-bold truncate">
            {goal.athlete_name.split(' ')[0]}
          </span>
          <span className="text-[#4b5563] text-[10px] shrink-0">{goal.label}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-[#f97316] font-bold">{formatGoalTime(goal.target_secs)}</span>
          <span className="text-[#6b7280]">{paceStr(targetPace)}/km</span>
          <span className="text-[#6b7280]">{distanceKm(goal.distance_key as DistanceKey)}km</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`text-xs font-mono font-bold ${statusColor}`}>
          {isPast ? 'Done' : `${daysLeft}d`}
        </div>
        <div className="text-[10px] text-[#4b5563]">
          {format(new Date(goal.race_date), 'MMM d')}
        </div>
      </div>
    </div>
  )
}

const DISTANCE_LABELS: Record<string, string> = {
  '5k': '5K', '10k': '10K', 'half_marathon': 'HM', 'marathon': 'FM'
}

export default function GroupGoalsSection({ memberGoals }: Props) {
  const [memberFilter, setMemberFilter] = useState<string>('all')
  const [distanceFilter, setDistanceFilter] = useState<string>('all')

  if (memberGoals.length === 0) {
    return (
      <div className="card border-dashed border-[#2a2a2a] flex flex-col items-center justify-center py-8 text-center gap-2 fade-up">
        <p className="text-[#4b5563] text-sm">No group members have set race goals yet.</p>
      </div>
    )
  }

  // Unique members and distances for filters
  const members = Array.from(new Map(memberGoals.map(g => [g.athlete_id, g.athlete_name])).entries())
  const distances = Array.from(new Set(memberGoals.map(g => g.distance_key)))

  const filtered = memberGoals.filter(g => {
    if (memberFilter !== 'all' && String(g.athlete_id) !== memberFilter) return false
    if (distanceFilter !== 'all' && g.distance_key !== distanceFilter) return false
    return true
  })

  return (
    <div className="card fade-up" style={{ paddingBottom: '1.5rem' }}>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Member filter */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setMemberFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${memberFilter === 'all' ? 'bg-[#f97316] text-white' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'}`}
          >
            All
          </button>
          {members.map(([id, name]) => (
            <button
              key={id}
              onClick={() => setMemberFilter(memberFilter === String(id) ? 'all' : String(id))}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${memberFilter === String(id) ? 'bg-[#f97316] text-white' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'}`}
            >
              {name.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-[#2a2a2a] mx-1" />

        {/* Distance filter */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setDistanceFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${distanceFilter === 'all' ? 'bg-[#1c1c1c] text-white border border-[#3a3a3a]' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'}`}
          >
            All races
          </button>
          {distances.map(d => (
            <button
              key={d}
              onClick={() => setDistanceFilter(distanceFilter === d ? 'all' : d)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${distanceFilter === d ? 'bg-[#1c1c1c] text-white border border-[#3a3a3a]' : 'bg-[#1c1c1c] text-[#6b7280] hover:text-white'}`}
            >
              {DISTANCE_LABELS[d] ?? d}
            </button>
          ))}
        </div>
      </div>

      {/* Goal rows */}
      {filtered.length === 0 ? (
        <p className="text-[#4b5563] text-sm text-center py-4">No goals match the selected filters.</p>
      ) : (
        <div>
          {filtered.map(goal => (
            <CompactGoalRow key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  )
}
