'use client'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Plus, Pencil, Moon } from 'lucide-react'
import { metersToMiles, distanceUnitLabel } from '@/lib/utils'
import { useUnit } from '@/lib/unit-context'
import { Avatar, type Member, type Group } from '@/components/GroupShared'
import { PLAN_SESSION_TYPES } from '@/lib/planTypes'
import PlanSessionModal, { type SessionConfig, calcDist } from '@/components/PlanSessionModal'

interface UserPlan {
  id: string
  athlete_id: number
  plan_date: string
  session_index: number
  session_type: string | null
  description: string | null
  target_distance_meters: number | null
}

interface Props {
  group: Group
  members: Member[]
  myAthleteId: number
}

const PLANS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function readPlansCache(groupId: string): UserPlan[] | null {
  try {
    const raw = sessionStorage.getItem(`group_plans_${groupId}`)
    if (!raw) return null
    const { data, cachedAt } = JSON.parse(raw)
    if (Date.now() - cachedAt > PLANS_CACHE_TTL) return null
    return data as UserPlan[]
  } catch { return null }
}

function writePlansCache(groupId: string, plans: UserPlan[]) {
  try { sessionStorage.setItem(`group_plans_${groupId}`, JSON.stringify({ data: plans, cachedAt: Date.now() })) } catch {}
}

function invalidatePlansCache(groupId: string) {
  try { sessionStorage.removeItem(`group_plans_${groupId}`) } catch {}
}

export default function GroupPlansTab({ group, members, myAthleteId }: Props) {
  const { unit } = useUnit()
  const toDisplay = (m: number) => unit === 'miles' ? metersToMiles(m) : m / 1000
  const label = distanceUnitLabel(unit)

  const [plans, setPlans] = useState<UserPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editingSessionIdx, setEditingSessionIdx] = useState<number | null>(null)
  const [modalConfig, setModalConfig] = useState<SessionConfig | null>(null)

  useEffect(() => {
    async function loadPlans() {
      const cached = readPlansCache(group.id)
      if (cached) { setPlans(cached); return }
      setPlansLoading(true)
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      const res = await fetch(`/api/groups/${group.id}/plans?today=${todayStr}`)
      const data = await res.json()
      const fetched = data.plans ?? []
      setPlans(fetched)
      writePlansCache(group.id, fetched)
      setPlansLoading(false)
    }
    loadPlans()
  }, [group.id])

  function loadSessionsLocal(date: string): SessionConfig[] {
    try {
      const s = localStorage.getItem(`plan_sessions_v3_${date}`)
      if (s) return JSON.parse(s)
      // Legacy migration
      const run = localStorage.getItem(`plan_v2_${date}`)
      if (run) {
        const sessions = [JSON.parse(run) as SessionConfig]
        localStorage.setItem(`plan_sessions_v3_${date}`, JSON.stringify(sessions))
        localStorage.removeItem(`plan_v2_${date}`)
        return sessions
      }
      if (localStorage.getItem(`plan_rest_v1_${date}`) === '1') {
        const sessions = [{ name: '', sessionType: 'rest', warmupMode: 'time' as const, warmupMin: 0, warmupM: 0, warmupPace: '', blocks: [], cooldownMode: 'time' as const, cooldownMin: 0, cooldownM: 0, cooldownPace: '' }]
        localStorage.setItem(`plan_sessions_v3_${date}`, JSON.stringify(sessions))
        localStorage.removeItem(`plan_rest_v1_${date}`)
        return sessions
      }
    } catch {}
    return []
  }

  function openPlanEdit(date: string, sessionIdx: number | null) {
    const sessions = loadSessionsLocal(date)
    const config = sessionIdx !== null ? (sessions[sessionIdx] ?? null) : null
    setModalConfig(config)
    setEditingDate(date)
    setEditingSessionIdx(sessionIdx)
  }

  function handlePlanSave(date: string, sessionIdx: number | null, config: SessionConfig) {
    const existing = loadSessionsLocal(date)
    let next: SessionConfig[]
    if (sessionIdx === null) {
      next = [...existing, config]
    } else {
      next = existing.map((s, i) => i === sessionIdx ? config : s)
    }
    try { localStorage.setItem(`plan_sessions_v3_${date}`, JSON.stringify(next)) } catch {}
    invalidatePlansCache(group.id)

    fetch(`/api/plans?date=${date}`, { method: 'DELETE' })
      .then(() => {
        next.forEach((s, i) => {
          const isRest = s.sessionType === 'rest'
          const totalMeters = isRest ? null : (calcDist(s, unit) > 0 ? calcDist(s, unit) : null)
          fetch('/api/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plan_date: date,
              session_index: i,
              session_type: s.sessionType || 'easy',
              description: isRest ? null : (s.name || null),
              target_distance_meters: totalMeters,
            }),
          }).catch(e => console.error('[group plan sync]', e))
        })
      })
      .catch(e => console.error('[group plan sync delete-first]', e))

    setPlans(prev => {
      const filtered = prev.filter(p => !(p.athlete_id === myAthleteId && p.plan_date === date))
      const newEntries = next.map((s, i) => ({
        id: 'local',
        athlete_id: myAthleteId,
        plan_date: date,
        session_index: i,
        session_type: s.sessionType || 'easy',
        description: s.sessionType === 'rest' ? null : (s.name || null),
        target_distance_meters: s.sessionType === 'rest' ? null : (calcDist(s, unit) > 0 ? calcDist(s, unit) : null),
      }))
      return [...filtered, ...newEntries].sort((a, b) =>
        a.plan_date.localeCompare(b.plan_date) || a.session_index - b.session_index
      )
    })
  }

  function handlePlanDelete(date: string, sessionIdx: number) {
    const existing = loadSessionsLocal(date)
    const next = existing.filter((_, i) => i !== sessionIdx)
    try {
      if (next.length === 0) {
        localStorage.removeItem(`plan_sessions_v3_${date}`)
      } else {
        localStorage.setItem(`plan_sessions_v3_${date}`, JSON.stringify(next))
      }
    } catch {}

    invalidatePlansCache(group.id)
    fetch(`/api/plans?date=${date}`, { method: 'DELETE' })
      .then(() => {
        next.forEach((s, i) => {
          const isRest = s.sessionType === 'rest'
          const totalMeters = isRest ? null : (calcDist(s, unit) > 0 ? calcDist(s, unit) : null)
          fetch('/api/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plan_date: date,
              session_index: i,
              session_type: s.sessionType || 'easy',
              description: isRest ? null : (s.name || null),
              target_distance_meters: totalMeters,
            }),
          }).catch(e => console.error('[group plan resync]', e))
        })
      })
      .catch(e => console.error('[group plan delete]', e))

    setPlans(prev => {
      const filtered = prev.filter(p => !(p.athlete_id === myAthleteId && p.plan_date === date))
      const newEntries = next.map((s, i) => ({
        id: 'local',
        athlete_id: myAthleteId,
        plan_date: date,
        session_index: i,
        session_type: s.sessionType || 'easy',
        description: s.sessionType === 'rest' ? null : (s.name || null),
        target_distance_meters: s.sessionType === 'rest' ? null : (calcDist(s, unit) > 0 ? calcDist(s, unit) : null),
      }))
      return [...filtered, ...newEntries].sort((a, b) =>
        a.plan_date.localeCompare(b.plan_date) || a.session_index - b.session_index
      )
    })
    setEditingDate(null)
    setEditingSessionIdx(null)
  }

  // Build 7-day list starting today
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + i)
    return d
  })

  // Me first
  const sortedMembers = [...members].sort((a, b) => {
    if (a.athlete_id === myAthleteId) return -1
    if (b.athlete_id === myAthleteId) return 1
    return 0
  })

  return (
    <div className="fade-up space-y-6">
      {plansLoading ? (
        <div className="card text-center py-10">
          <p className="text-[#6b7280] text-sm">Loading plans…</p>
        </div>
      ) : (
        days.map(day => {
          const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
          const isToday = day.toDateString() === new Date().toDateString()
          const dayPlans = plans.filter(p => p.plan_date === dateStr)

          return (
            <div key={dateStr}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-sm font-bold ${isToday ? 'text-[#f97316]' : 'text-white'}`}>
                  {format(day, 'EEE, MMM d')}
                </span>
                {isToday && (
                  <span className="text-[10px] font-bold text-[#f97316] bg-[#f97316]/10 px-1.5 py-0.5 rounded">Today</span>
                )}
              </div>

              {/* Member session cards */}
              <div className="space-y-2">
                {sortedMembers.map(m => {
                  const memberPlans = dayPlans.filter(p => p.athlete_id === m.athlete_id)
                    .sort((a, b) => a.session_index - b.session_index)
                  const isMe = m.athlete_id === myAthleteId
                  const hasRest = memberPlans.some(p => p.session_type === 'rest')

                  return (
                    <div key={m.athlete_id} className="space-y-1">
                      {memberPlans.length === 0 ? (
                        <div
                          onClick={isMe ? () => openPlanEdit(dateStr, null) : undefined}
                          className={`rounded-xl px-3 py-2.5 transition-all ${isMe ? 'cursor-pointer border border-dashed border-[#3a3a3a] hover:border-[#f97316]/30' : 'border border-dashed border-[#1c1c1c]'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Avatar name={m.name} pic={m.profile_pic} size={4} />
                            <span className={`text-[10px] font-bold ${isMe ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>
                              {isMe ? 'You' : m.name.split(' ')[0]}
                            </span>
                          </div>
                          <div className={`flex items-center gap-1 ${isMe ? 'text-[#4b5563]' : 'text-[#333]'}`}>
                            {isMe && <Plus size={10} />}
                            <span className="text-[10px]">{isMe ? 'Add plan' : '—'}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          {memberPlans.map((plan, pi) => {
                            const sessionMeta = PLAN_SESSION_TYPES.find(s => s.key === plan.session_type)
                            const isRest = plan.session_type === 'rest'
                            return (
                              <div
                                key={plan.session_index}
                                onClick={isMe ? () => openPlanEdit(dateStr, plan.session_index) : undefined}
                                className={`rounded-xl px-3 py-2.5 transition-all ${isMe ? 'cursor-pointer' : ''} ${
                                  isRest
                                    ? `bg-[#150f1e] border border-[#3b2060]${isMe ? ' hover:border-[#5b3090]' : ''}`
                                    : `bg-[#1a1a1a]${isMe ? ' hover:ring-1 hover:ring-[#f97316]/50 hover:brightness-110' : ''}`
                                }`}
                              >
                                {/* Member name row — only on first card */}
                                {pi === 0 && (
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Avatar name={m.name} pic={m.profile_pic} size={4} />
                                    <span className={`text-[10px] font-bold ${isMe ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>
                                      {isMe ? 'You' : m.name.split(' ')[0]}
                                    </span>
                                    {isMe && <Pencil size={10} className="text-[#4b5563] ml-auto" />}
                                  </div>
                                )}
                                {pi > 0 && (
                                  <div className="flex items-center gap-1.5 mb-1.5 ml-5">
                                    {isMe && <Pencil size={10} className="text-[#4b5563] ml-auto" />}
                                  </div>
                                )}

                                {/* Session content */}
                                {isRest ? (
                                  <div className={`flex items-center gap-1.5 ${isMe ? 'text-[#a78bfa]' : 'text-[#7c5fa8]'}`}>
                                    <Moon size={11} className="opacity-70" />
                                    <span className="text-xs">Rest day</span>
                                  </div>
                                ) : (
                                  <>
                                    {plan.description && (
                                      <div className="text-xs font-medium text-white leading-tight">{plan.description}</div>
                                    )}
                                    {sessionMeta && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sessionMeta.color}`} />
                                        <span className="text-[#9ca3af] text-[10px]">{sessionMeta.label}</span>
                                      </div>
                                    )}
                                    {plan.target_distance_meters && (
                                      <div className="text-[#4b5563] mt-0.5 text-[10px] font-mono">
                                        {toDisplay(plan.target_distance_meters).toFixed(1)} {label}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )
                          })}
                          {/* Add another run button — only for me, no rest */}
                          {isMe && !hasRest && (
                            <button
                              onClick={() => openPlanEdit(dateStr, null)}
                              className="w-full rounded-lg py-1 text-[10px] text-[#4b5563] hover:text-[#f97316] border border-dashed border-[#2a2a2a] hover:border-[#f97316]/30 flex items-center justify-center gap-1 transition-colors"
                            >
                              <Plus size={9} /> Add run
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      {/* Plan edit modal */}
      {editingDate && (
        <PlanSessionModal
          displayDate={format(new Date(editingDate + 'T00:00:00'), 'EEE, MMM d')}
          initialConfig={modalConfig}
          onClose={() => { setEditingDate(null); setEditingSessionIdx(null) }}
          onSave={(config) => handlePlanSave(editingDate, editingSessionIdx, config)}
          onDelete={editingSessionIdx !== null ? () => handlePlanDelete(editingDate, editingSessionIdx!) : undefined}
        />
      )}
    </div>
  )
}
