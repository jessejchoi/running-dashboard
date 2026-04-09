'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { type DistanceUnit, distanceUnitLabel, metersToMiles } from '@/lib/utils'
import { PLAN_SESSION_TYPES } from '@/lib/planTypes'
import { type SessionConfig, calcDist, calcDuration } from '@/components/PlanSessionModal'

const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatSessionDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

const SESSIONS_KEY = (date: string) => `plan_sessions_v3_${date}`

interface DayEntry {
  dayAbbr: string
  dateLabel: string
  dateStr: string
  sessions: SessionConfig[]
}

export default function WeeklyPlanCard({ unit }: { unit: DistanceUnit }) {
  const [days, setDays] = useState<DayEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const monday = getMondayOfWeek(new Date())
    const entries: DayEntry[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i)
      const dateStr = toDateStr(d)
      let sessions: SessionConfig[] = []
      try {
        const raw = localStorage.getItem(SESSIONS_KEY(dateStr))
        if (raw) sessions = JSON.parse(raw)
      } catch {}
      entries.push({
        dayAbbr: DAY_ABBR[i],
        dateLabel: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
        dateStr,
        sessions,
      })
    }
    setDays(entries)
    setLoaded(true)
  }, [])

  const hasSessions = days.some(d => d.sessions.length > 0)

  return (
    <section className="mb-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">Training Plan This Week</h2>
        <Link href="/plan" className="font-mono text-xs text-[#6b7280] hover:text-orange-500 transition-colors">
          Full plan →
        </Link>
      </div>
    <div className="card fade-up" style={{ padding: '1.25rem' }}>

      {!loaded ? (
        <div className="animate-pulse flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-[#1c1c1c]" />
          ))}
        </div>
      ) : !hasSessions ? (
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          No sessions planned —{' '}
          <Link href="/plan" style={{ color: 'var(--orange)' }}>Add to plan →</Link>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {days.map(day => {
            if (day.sessions.length === 0) return null
            return (
              <div key={day.dateStr}>
                {day.sessions.map((session, idx) => {
                  const typeConfig = PLAN_SESSION_TYPES.find(t => t.key === session.sessionType)
                  const distKm = calcDist(session, 'km')
                  const distDisplay = unit === 'miles'
                    ? `${metersToMiles(distKm * 1000).toFixed(1)} mi`
                    : distKm > 0 ? `${distKm.toFixed(1)} km` : null
                  const durSecs = calcDuration(session, unit)
                  const durDisplay = durSecs > 0 ? formatSessionDuration(durSecs) : null

                  return (
                    <div key={idx} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Day label */}
                      <div className="shrink-0 w-20">
                        <span className="font-mono text-xs font-bold text-white">{day.dayAbbr}</span>
                        <span className="font-mono text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>{day.dateLabel}</span>
                      </div>

                      {/* Type badge */}
                      {typeConfig && (
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${typeConfig.color}`}>
                          {typeConfig.label}
                        </span>
                      )}

                      {/* Session name */}
                      <span className="text-sm text-white truncate flex-1 min-w-0">
                        {session.name || typeConfig?.label || 'Run'}
                      </span>

                      {/* Distance / duration */}
                      <div className="shrink-0 flex items-center gap-2 ml-auto">
                        {distDisplay && (
                          <span className="stat-num text-sm font-bold text-white">{distDisplay}</span>
                        )}
                        {durDisplay && (
                          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{durDisplay}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
    </section>
  )
}
