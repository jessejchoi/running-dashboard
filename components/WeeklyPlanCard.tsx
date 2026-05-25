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
    <section className="mt-8 mb-[14px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-[28px] text-[#F1EDE8] uppercase leading-none">Plan This Week</h2>
        <Link href="/plan" prefetch={true} className="pulse-link">
          Full plan
        </Link>
      </div>
    <div className="card pulse-bar acid fade-up p-[18px] sm:p-6">
      <span className="pulse-idx">[07]</span>

      {!loaded ? (
        <div className="animate-pulse flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 bg-[#29292f]" />
          ))}
        </div>
      ) : !hasSessions ? (
        <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--fg-3)' }}>
          No sessions planned /{' '}
          <Link href="/plan" style={{ color: 'var(--magenta)' }}>Add to plan</Link>
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
                    <div key={idx} className="py-[14px]" style={{ borderBottom: '1px solid var(--hair-1)' }}>
                      <div className="grid gap-3 sm:hidden">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="font-mono text-xs font-bold uppercase text-white">{day.dayAbbr}</span>
                            <span className="block font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--fg-3)' }}>{day.dateLabel}</span>
                          </div>
                          <div className="shrink-0 text-right">
                            {distDisplay && (
                              <span className="block font-mono text-sm font-bold text-white">{distDisplay}</span>
                            )}
                            {durDisplay && (
                              <span className="block font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--fg-3)' }}>{durDisplay}</span>
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <span className="block truncate font-display text-[17px] font-bold uppercase leading-none text-white">
                            {session.name || typeConfig?.label || 'Run'}
                          </span>
                        </div>

                        {typeConfig && (
                          <span className={`chip w-fit max-w-full truncate border ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                        )}
                      </div>

                      <div className="hidden grid-cols-[72px_auto_1fr_auto] items-center gap-3 sm:grid">
                        {/* Day label */}
                        <div className="shrink-0">
                          <span className="font-mono text-xs font-bold text-white uppercase">{day.dayAbbr}</span>
                          <span className="font-mono text-[10px] block uppercase tracking-[0.14em]" style={{ color: 'var(--fg-3)' }}>{day.dateLabel}</span>
                        </div>

                        {/* Type badge */}
                        {typeConfig && (
                          <span className={`chip shrink-0 border ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                        )}

                        {/* Session name */}
                        <span className="font-display text-[16px] font-bold uppercase text-white truncate min-w-0">
                          {session.name || typeConfig?.label || 'Run'}
                        </span>

                        {/* Distance / duration */}
                        <div className="shrink-0 flex items-center gap-2 ml-auto">
                          {distDisplay && (
                            <span className="font-mono text-sm font-bold text-white">{distDisplay}</span>
                          )}
                          {durDisplay && (
                            <span className="font-mono text-xs" style={{ color: 'var(--fg-3)' }}>{durDisplay}</span>
                          )}
                        </div>
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
