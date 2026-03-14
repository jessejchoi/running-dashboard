'use client'
import { useState } from 'react'
import { Copy, Check, Users, Target, Activity, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { toJakartaDate, speedToPace, formatDuration, formatDistanceShort, paceUnitLabel } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'

interface Goal {
  id: string
  athlete_id: number
  distance_key: string
  label: string
  target_secs: number
  current_secs: number | null
  race_date: string
}

interface Member {
  athlete_id: number
  role: string
  joined_at: string
  name: string
  profile_pic: string | null
  gender: string | null
  goals: Goal[]
  is_me: boolean
}

interface Run {
  id: number
  athlete_id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate: number | null
  run_type: string | null
}

interface Group {
  id: string
  name: string
  invite_code: string
  created_by: number
  created_at: string
}

interface Props {
  group: Group
  members: Member[]
  recentRuns: Run[]
  myRole: string
  inviteUrl: string
  myAthleteId: number
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Avatar({ name, pic, size = 8 }: { name: string; pic: string | null; size?: number }) {
  if (pic) {
    return <img src={pic} alt={name} className={`w-${size} h-${size} rounded-full object-cover`} />
  }
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`w-${size} h-${size} rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-xs`}>
      {initials}
    </div>
  )
}

function GoalPill({ goal }: { goal: Goal }) {
  const daysLeft = Math.ceil((new Date(goal.race_date).getTime() - Date.now()) / 86400000)
  const isPast = daysLeft < 0
  return (
    <div className="bg-[#1c1c1c] rounded-lg px-2.5 py-1.5 text-xs">
      <div className="font-bold text-white">{goal.label}</div>
      <div className="text-[#6b7280] mt-0.5">
        {isPast ? 'Past race' : `${daysLeft}d away`} · {formatTime(goal.target_secs)}
      </div>
    </div>
  )
}

function RunTypeDot({ type }: { type: string | null }) {
  const colors: Record<string, string> = {
    interval_5k: 'bg-red-500',
    threshold: 'bg-orange-500',
    long_easy: 'bg-sky-500',
    easy: 'bg-emerald-500',
    easy_strides: 'bg-teal-500',
    recovery: 'bg-green-400',
  }
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[type ?? ''] ?? 'bg-zinc-500'}`} />
  )
}

export default function GroupPageClient({ group, members, recentRuns, myRole, inviteUrl, myAthleteId }: Props) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'feed' | 'members' | 'goals'>('feed')
  const { unit } = useUnit()

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Build member name lookup
  const memberMap = Object.fromEntries(members.map(m => [m.athlete_id, m]))

  return (
    <main className="max-w-4xl mx-auto px-4 pt-14 sm:pt-20 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 fade-up">
        <div>
          <h1 className="font-display font-extrabold text-4xl">{group.name}</h1>
          <p className="text-[#6b7280] text-sm mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} · Created {format(new Date(group.created_at), 'MMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={copyInvite}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold border border-[#2a2a2a] hover:border-[#f97316] text-[#6b7280] hover:text-[#f97316] rounded-lg transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Invite link'}
        </button>
      </div>

      {/* Invite banner — shows until there are 2+ members */}
      {members.length < 2 && (
        <div className="card border-dashed border-[#2a2a2a] mb-6 fade-up">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#f97316]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Users size={14} className="text-[#f97316]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm mb-1">Invite your training partners</p>
              <p className="text-[#6b7280] text-xs mb-3">Share this link so they can join the group.</p>
              <div className="flex items-center gap-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2">
                <span className="text-[#6b7280] text-xs font-mono truncate flex-1">{inviteUrl}</span>
                <button onClick={copyInvite} className="text-[#f97316] text-xs font-bold shrink-0 hover:underline">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-[#1c1c1c] fade-up">
        {([
          { key: 'feed',    label: 'Recent Runs', icon: Activity },
          { key: 'members', label: 'Members',     icon: Users },
          { key: 'goals',   label: 'Goals',       icon: Target },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-[#f97316] text-white'
                : 'border-transparent text-[#6b7280] hover:text-white'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Feed tab */}
      {tab === 'feed' && (
        <div className="space-y-3 fade-up">
          {recentRuns.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-[#6b7280] text-sm">No runs in the last 7 days from group members.</p>
            </div>
          ) : recentRuns.map(run => {
            const member = memberMap[run.athlete_id]
            const isMe = run.athlete_id === myAthleteId
            return (
              <div key={run.id} className="card hover:border-[#2a2a2a] transition-colors">
                <div className="flex items-start gap-3">
                  <Avatar name={member?.name ?? '?'} pic={member?.profile_pic ?? null} size={8} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-sm">{member?.name ?? `Athlete ${run.athlete_id}`}</span>
                      {isMe && <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>}
                      {member?.gender && <span className="text-[10px] text-[#4b5563] font-mono">{member.gender === 'M' ? '♂' : '♀'}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#6b7280] mb-2">
                      <RunTypeDot type={run.run_type} />
                      <span>{run.run_type?.replace(/_/g, ' ') ?? 'run'}</span>
                      <span>·</span>
                      <span>{format(toJakartaDate(run.start_date), 'EEE MMM d, h:mm a')}</span>
                    </div>
                    <a href={`/runs/${run.id}`} className="font-medium text-sm text-white hover:text-[#f97316] transition-colors block truncate mb-2">
                      {run.name}
                    </a>
                    <div className="flex gap-4 text-xs font-mono">
                      <span className="text-[#f97316] font-bold">{formatDistanceShort(run.distance, unit)}</span>
                      <span className="text-white">{speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}</span>
                      <span className="text-[#6b7280]">{formatDuration(run.moving_time)}</span>
                      {run.average_heartrate && (
                        <span className="text-[#6b7280]">{Math.round(run.average_heartrate)} bpm</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="space-y-3 fade-up">
          {members.map(m => (
            <div key={m.athlete_id} className="card">
              <div className="flex items-center gap-3">
                <Avatar name={m.name} pic={m.profile_pic} size={10} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{m.name}</span>
                    {m.is_me && <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>}
                    {m.role === 'admin' && <span className="text-[10px] text-yellow-400 font-bold bg-yellow-400/10 px-1.5 py-0.5 rounded">Admin</span>}
                    {m.gender && <span className="text-[10px] text-[#4b5563] font-mono">{m.gender === 'M' ? '♂' : '♀'}</span>}
                  </div>
                  <p className="text-[#6b7280] text-xs mt-0.5">
                    Joined {format(new Date(m.joined_at), 'MMM d, yyyy')}
                    {m.goals.length > 0 && ` · ${m.goals.length} goal${m.goals.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Goals tab */}
      {tab === 'goals' && (
        <div className="space-y-6 fade-up">
          {members.map(m => (
            <div key={m.athlete_id}>
              <div className="flex items-center gap-2 mb-3">
                <Avatar name={m.name} pic={m.profile_pic} size={6} />
                <span className="font-bold text-sm">{m.name}</span>
                {m.is_me && <span className="text-[10px] text-[#f97316] font-bold bg-[#f97316]/10 px-1.5 py-0.5 rounded">You</span>}
              </div>
              {m.goals.length === 0 ? (
                <p className="text-[#4b5563] text-xs pl-8">No goals set yet</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-8">
                  {m.goals.map(goal => {
                    const daysLeft = Math.ceil((new Date(goal.race_date).getTime() - Date.now()) / 86400000)
                    const isPast = daysLeft < 0
                    const km = { '5k': 5, '10k': 10, 'hm': 21.0975, 'fm': 42.195 }[goal.distance_key] ?? 5
                    const targetPace = goal.target_secs / km
                    const paceStr = (s: number) => `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`

                    // Progress bar
                    const baselinePace = goal.current_secs ? goal.current_secs / km : targetPace + 30
                    const currentPace = goal.current_secs ? goal.current_secs / km : null
                    const progress = currentPace && baselinePace > targetPace
                      ? Math.min(1, Math.max(0, (baselinePace - currentPace) / (baselinePace - targetPace)))
                      : 0

                    return (
                      <div key={goal.id} className="bg-[#111] border border-[#1c1c1c] rounded-xl p-3">
                        <div className="font-bold text-sm mb-1">{goal.label}</div>
                        <div className="text-[#6b7280] text-xs mb-2">
                          {isPast ? 'Past race' : `${daysLeft}d away`} · {format(new Date(goal.race_date), 'MMM d yyyy')}
                        </div>
                        <div className="flex gap-3 text-xs mb-2">
                          <div>
                            <div className="text-[#4b5563] mb-0.5">Target</div>
                            <div className="font-mono text-[#f97316] font-bold">{paceStr(targetPace)}{paceUnitLabel(unit)}</div>
                          </div>
                          {goal.current_secs && (
                            <div>
                              <div className="text-[#4b5563] mb-0.5">Current</div>
                              <div className="font-mono text-white font-bold">{formatTime(goal.current_secs)}</div>
                            </div>
                          )}
                        </div>
                        <div className="h-1 bg-[#242424] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#f97316]" style={{ width: `${progress * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
