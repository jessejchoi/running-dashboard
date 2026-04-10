'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { differenceInDays, format } from 'date-fns'
import { formatGoalTime, paceSecs, distanceKm, type UserGoal, type DistanceKey } from '@/lib/goals'
import { paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'
import { ChevronDown, Check } from 'lucide-react'

interface MemberGoal extends UserGoal {
  athlete_name: string
  athlete_profile: string | null
}

interface Props {
  memberGoals: MemberGoal[]
  groupName?: string
}

function paceStr(secs: number) {
  const total = Math.round(secs)
  const m = Math.floor(total / 60)
  const s = total % 60
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

const DISTANCE_CONFIG: Record<string, { label: string; short: string; color: string; bg: string; dot: string }> = {
  '5k':            { label: '5K',            short: '5K',  color: 'text-red-400',    bg: 'bg-red-400/10',    dot: 'bg-red-400' },
  '10k':           { label: '10K',           short: '10K', color: 'text-orange-400', bg: 'bg-orange-400/10', dot: 'bg-orange-400' },
  'half_marathon': { label: 'Half Marathon', short: 'HM',  color: 'text-sky-400',    bg: 'bg-sky-400/10',    dot: 'bg-sky-400' },
  'marathon':      { label: 'Marathon',      short: 'FM',  color: 'text-purple-400', bg: 'bg-purple-400/10', dot: 'bg-purple-400' },
}

// ── Custom dropdown ────────────────────────────────────────────────────────────
interface DropdownProps {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}

function FilterDropdown({ value, onChange, options, placeholder }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  function updatePos() {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropH = options.length * 36 + 16
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow < dropH ? rect.top - dropH - 4 : rect.bottom + 4
    const dropW = 160
    const left = rect.left + dropW > window.innerWidth
      ? Math.max(4, window.innerWidth - dropW - 8)
      : rect.left
    setPos({ top, left })
  }

  useEffect(() => { if (open) updatePos() }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = options.find(o => o.value === value)

  const dropdown = mounted && open ? createPortal(
    <div
      ref={dropRef}
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[9999] bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl shadow-2xl py-1 min-w-[160px]"
    >
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => { onChange(opt.value); setOpen(false) }}
          className="w-full text-left px-3 py-2 text-xs text-[#9ca3af] hover:bg-[#242424] flex items-center justify-between gap-2 transition-colors"
        >
          <span className={value === opt.value ? 'text-white font-medium' : ''}>{opt.label}</span>
          {value === opt.value && <Check size={10} className="text-[#f97316]" />}
        </button>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 min-h-[44px] rounded bg-[#1c1c1c] border border-[#2a2a2a] hover:border-[#3a3a3a] text-xs text-[#9ca3af] transition-all"
      >
        <span className={selected?.value !== 'all' ? 'text-white font-medium' : ''}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdown}
    </div>
  )
}

// ── Goal row ──────────────────────────────────────────────────────────────────
function GoalRow({ goal, unit }: { goal: MemberGoal; unit: DistanceUnit }) {
  const daysLeft = differenceInDays(new Date(goal.race_date), new Date())
  const isPast = daysLeft < 0
  const dist = DISTANCE_CONFIG[goal.distance_key] ?? DISTANCE_CONFIG['5k']
  const paceMultiplier = unit === 'miles' ? 1.60934 : 1
  const targetPace = paceSecs(goal.target_secs, goal.distance_key as DistanceKey) * paceMultiplier
  const progress = goal.current_secs && goal.target_secs
    ? Math.min(1, goal.target_secs / goal.current_secs)
    : 0

  const urgencyColor = isPast
    ? 'text-[#4b5563]'
    : daysLeft <= 14 ? 'text-[var(--warning)]'
    : daysLeft <= 60 ? 'text-[var(--success)]'
    : 'text-[#6b7280]'

  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#1a1a1a] last:border-0 group">
      {/* Avatar */}
      <Avatar name={goal.athlete_name} pic={goal.athlete_profile} />

      {/* Name + distance badge */}
      <div className="w-28 shrink-0">
        <div className="text-white text-xs font-bold truncate leading-tight">
          {goal.athlete_name.split(' ')[0]}
        </div>
        <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-px rounded-md ${dist.color} ${dist.bg}`}>
          {dist.short}
        </span>
      </div>

      {/* Progress + target */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-white text-xs font-bold">{formatGoalTime(goal.target_secs)}</span>
          <span className="font-mono text-[#6b7280] text-[10px]">{paceStr(targetPace)}{paceUnitLabel(unit)}</span>
        </div>
        <div className="h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${dist.dot}`}
            style={{ width: `${Math.max(2, progress * 100)}%`, opacity: 0.7 }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-[#4b5563] font-mono">
            {goal.current_secs ? `${formatGoalTime(goal.current_secs)} · ${paceStr(paceSecs(goal.current_secs, goal.distance_key as DistanceKey) * paceMultiplier)}${paceUnitLabel(unit)}` : '—'}
          </span>
          <span className={`text-[10px] font-mono font-bold ${dist.color}`}>
            {formatGoalTime(goal.target_secs)} · {paceStr(targetPace)}{paceUnitLabel(unit)}
          </span>
        </div>
      </div>

      {/* Countdown */}
      <div className="shrink-0 text-right w-10">
        <div className={`text-xs font-mono font-bold ${urgencyColor}`}>
          {isPast ? 'Done' : `${daysLeft}d`}
        </div>
        <div className="text-[10px] text-[#3a3a3a]">
          {format(new Date(goal.race_date), 'MMM d')}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function GroupGoalsSection({ memberGoals, groupName }: Props) {
  const { unit } = useUnit()
  const [memberFilter, setMemberFilter] = useState('all')
  const [distanceFilter, setDistanceFilter] = useState('all')

  if (memberGoals.length === 0) {
    return (
      <div className="card border-dashed border-[#2a2a2a] flex flex-col items-center justify-center py-8 text-center gap-2 fade-up">
        <p className="text-[#4b5563] text-sm">No group members have set race goals yet.</p>
      </div>
    )
  }

  const members = Array.from(new Map(memberGoals.map(g => [String(g.athlete_id), g.athlete_name])).entries())
  const distances = Array.from(new Set(memberGoals.map(g => g.distance_key)))

  const memberOptions = [
    { value: 'all', label: 'All members' },
    ...members.map(([id, name]) => ({ value: id, label: name.split(' ')[0] }))
  ]
  const distanceOptions = [
    { value: 'all', label: 'All races' },
    ...distances.map(d => ({ value: d, label: DISTANCE_CONFIG[d]?.label ?? d }))
  ]

  // Filter then sort by soonest race date
  const filtered = memberGoals
    .filter(g => {
      if (memberFilter !== 'all' && String(g.athlete_id) !== memberFilter) return false
      if (distanceFilter !== 'all' && g.distance_key !== distanceFilter) return false
      return true
    })
    .sort((a, b) => new Date(a.race_date).getTime() - new Date(b.race_date).getTime())

  // Stats line
  const upcoming = memberGoals.filter(g => differenceInDays(new Date(g.race_date), new Date()) >= 0)

  return (
    <div className="card fade-up" style={{ paddingBottom: '1.5rem' }}>
      {groupName && (
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-4">
          {groupName} Race Goals
        </h2>
      )}
      {/* Header with stats + filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[#4b5563] text-[11px]">
          {upcoming.length} upcoming · {memberGoals.length} total
        </div>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={memberFilter}
            onChange={setMemberFilter}
            options={memberOptions}
            placeholder="All members"
          />
          <FilterDropdown
            value={distanceFilter}
            onChange={setDistanceFilter}
            options={distanceOptions}
            placeholder="All races"
          />
        </div>
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <p className="text-[#4b5563] text-sm text-center py-4">No goals match the selected filters.</p>
      ) : (
        <div>
          {filtered.map(goal => <GoalRow key={goal.id} goal={goal} unit={unit} />)}
        </div>
      )}
    </div>
  )
}
