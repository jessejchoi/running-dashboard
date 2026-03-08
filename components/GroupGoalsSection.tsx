'use client'
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
  if (pic) return <img src={pic} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-xs shrink-0">
      {initials}
    </div>
  )
}

function GoalCard({ goal }: { goal: MemberGoal }) {
  const daysLeft = differenceInDays(new Date(goal.race_date), new Date())
  const isPast = daysLeft < 0
  const targetPace = paceSecs(goal.target_secs, goal.distance_key as DistanceKey)
  const progress = goal.current_secs && goal.target_secs
    ? Math.min(1, (goal.current_secs - goal.target_secs) / goal.current_secs)
    : 0

  const statusColor = isPast ? 'text-[#4b5563]'
    : daysLeft <= 14 ? 'text-yellow-400'
    : 'text-emerald-400'

  return (
    <div className="card glow-orange fade-up" style={{ paddingBottom: '1.5rem' }}>
      {/* Owner header */}
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[#1c1c1c]">
        <Avatar name={goal.athlete_name} pic={goal.athlete_profile} />
        <div>
          <div className="font-bold text-white text-sm leading-tight">{goal.athlete_name.split(' ')[0]}</div>
          <div className="text-[#4b5563] text-[10px]">{goal.athlete_name}</div>
        </div>
      </div>

      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="font-display font-bold text-lg text-white leading-tight">{goal.label}</div>
          <div className="text-[#6b7280] text-xs mt-0.5">
            {format(new Date(goal.race_date), 'MMM d, yyyy')}
          </div>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-1 rounded-md bg-[#1c1c1c] shrink-0 ml-2 ${statusColor}`}>
          {isPast ? 'Done' : `${daysLeft}d`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#1c1c1c] rounded-lg px-3 py-2">
          <div className="text-[#6b7280] text-[10px] mb-0.5">Target</div>
          <div className="font-mono text-white text-sm font-bold">{formatGoalTime(goal.target_secs)}</div>
        </div>
        <div className="bg-[#1c1c1c] rounded-lg px-3 py-2">
          <div className="text-[#6b7280] text-[10px] mb-0.5">Pace</div>
          <div className="font-mono text-white text-sm font-bold">{paceStr(targetPace)}/km</div>
        </div>
        <div className="bg-[#1c1c1c] rounded-lg px-3 py-2">
          <div className="text-[#6b7280] text-[10px] mb-0.5">Dist</div>
          <div className="font-mono text-white text-sm font-bold">{distanceKm(goal.distance_key as DistanceKey)}km</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-[#6b7280] mb-1.5">
          <span>Progress to goal</span>
          <span className="font-mono">{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[#f97316] transition-all duration-700"
            style={{ width: `${progress * 100}%` }} />
        </div>
        {goal.current_secs && (
          <div className="flex justify-between text-[10px] text-[#3a3a3a] mt-1 font-mono">
            <span>{formatGoalTime(goal.current_secs)}</span>
            <span>{formatGoalTime(goal.target_secs)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function GroupGoalsSection({ memberGoals }: Props) {
  if (memberGoals.length === 0) {
    return (
      <div className="card border-dashed border-[#2a2a2a] flex flex-col items-center justify-center py-8 text-center gap-2 fade-up">
        <p className="text-[#4b5563] text-sm">No group members have set race goals yet.</p>
      </div>
    )
  }

  return (
    <div className={`grid gap-4 ${memberGoals.length >= 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : memberGoals.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {memberGoals.map(goal => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
    </div>
  )
}
