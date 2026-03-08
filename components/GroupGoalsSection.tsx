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
  const progress = goal.current_secs && goal.target_secs
    ? Math.min(1, Math.max(0, (goal.current_secs - goal.target_secs) / goal.current_secs))
    : 0
  const statusColor = isPast ? 'text-[#4b5563]' : daysLeft <= 14 ? 'text-yellow-400' : 'text-emerald-400'

  return (
    <div className="py-2.5 border-b border-[#1c1c1c] last:border-0">
      {/* Row 1: avatar, name, distance, days */}
      <div className="flex items-center gap-3 mb-1.5">
        <Avatar name={goal.athlete_name} pic={goal.athlete_profile} />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-white text-xs font-bold truncate">
            {goal.athlete_name.split(' ')[0]}
          </span>
          <span className="text-[#4b5563] text-[10px] shrink-0">{goal.label}</span>
          <span className="text-[#6b7280] text-[10px] shrink-0">
            {format(new Date(goal.race_date), 'MMM d')}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-xs font-mono font-bold ${statusColor}`}>
            {isPast ? 'Done' : `${daysLeft}d`}
          </span>
        </div>
      </div>

      {/* Row 2: stats */}
      <div className="flex items-center gap-3 text-[11px] font-mono pl-10 mb-2">
        <span className="text-[#f97316] font-bold">{formatGoalTime(goal.target_secs)}</span>
        <span className="text-[#6b7280]">{paceStr(targetPace)}/km</span>
        {goal.current_secs && (
          <span className="text-[#6b7280]">est. {formatGoalTime(goal.current_secs)}</span>
        )}
      </div>

      {/* Row 3: progress bar */}
      <div className="pl-10">
        <div className="h-1 bg-[#242424] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#f97316] transition-all duration-700"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[#3a3a3a] mt-0.5 font-mono">
          <span>{Math.round(progress * 100)}%</span>
          {goal.current_secs && <span>{formatGoalTime(goal.target_secs)}</span>}
        </div>
      </div>
    </div>
  )
}

const DISTANCE_LABELS: Record<string, string> = {
  '5k': '5K', '10k': '10K', 'half_marathon': 'Half Marathon', 'marathon': 'Marathon'
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

  const members = Array.from(new Map(memberGoals.map(g => [String(g.athlete_id), g.athlete_name])).entries())
  const distances = Array.from(new Set(memberGoals.map(g => g.distance_key)))

  const filtered = memberGoals.filter(g => {
    if (memberFilter !== 'all' && String(g.athlete_id) !== memberFilter) return false
    if (distanceFilter !== 'all' && g.distance_key !== distanceFilter) return false
    return true
  })

  const selectClass = "bg-[#1c1c1c] border border-[#2a2a2a] text-[#9ca3af] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#f97316] cursor-pointer"

  return (
    <div className="card fade-up" style={{ paddingBottom: '1.5rem' }}>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={memberFilter}
          onChange={e => setMemberFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">All members</option>
          {members.map(([id, name]) => (
            <option key={id} value={id}>{name.split(' ')[0]}</option>
          ))}
        </select>

        <select
          value={distanceFilter}
          onChange={e => setDistanceFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">All races</option>
          {distances.map(d => (
            <option key={d} value={d}>{DISTANCE_LABELS[d] ?? d}</option>
          ))}
        </select>
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
