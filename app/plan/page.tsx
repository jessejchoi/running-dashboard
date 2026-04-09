'use client'
import { useState, useEffect, useMemo } from 'react'
import Nav from '@/components/Nav'
import PlanSessionModal, { SessionConfig, calcDist, calcDuration, summarizeParts, summarizeSession, SummaryPart, defaultConfig } from '@/components/PlanSessionModal'
import { PLAN_SESSION_TYPES } from '@/lib/planTypes'
import { Plus, Moon } from 'lucide-react'
import { useUnit } from '@/lib/unit-context'
import { distanceUnitLabel, metersToMiles } from '@/lib/utils'

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

function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function dayAbbr(d: Date): string {
  const day = d.getDay()
  return DAY_ABBR[day === 0 ? 6 : day - 1]
}

function checkToday(d: Date): boolean {
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

function isPast(d: Date): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const t = new Date(d); t.setHours(0, 0, 0, 0)
  return t < today
}

function formatSessionTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

// New multi-session storage key
const SESSIONS_KEY = (date: string) => `plan_sessions_v3_${date}`
// Legacy keys (read-only for migration)
const LEGACY_RUN_KEY = (date: string) => `plan_v2_${date}`
const LEGACY_REST_KEY = (date: string) => `plan_rest_v1_${date}`

function loadSessions(date: string): SessionConfig[] {
  try {
    const s = localStorage.getItem(SESSIONS_KEY(date))
    if (s) return JSON.parse(s)
    // Migrate from legacy keys
    const run = localStorage.getItem(LEGACY_RUN_KEY(date))
    if (run) {
      const config = JSON.parse(run) as SessionConfig
      const sessions = [config]
      localStorage.setItem(SESSIONS_KEY(date), JSON.stringify(sessions))
      localStorage.removeItem(LEGACY_RUN_KEY(date))
      return sessions
    }
    if (localStorage.getItem(LEGACY_REST_KEY(date)) === '1') {
      const sessions = [{ ...defaultConfig(), sessionType: 'rest' }]
      localStorage.setItem(SESSIONS_KEY(date), JSON.stringify(sessions))
      localStorage.removeItem(LEGACY_REST_KEY(date))
      return sessions
    }
  } catch {}
  return []
}

function saveSessions(date: string, sessions: SessionConfig[]) {
  try {
    if (sessions.length === 0) {
      localStorage.removeItem(SESSIONS_KEY(date))
    } else {
      localStorage.setItem(SESSIONS_KEY(date), JSON.stringify(sessions))
    }
  } catch {}
}

export default function PlanPage() {
  const { unit } = useUnit()
  const unitLabel = distanceUnitLabel(unit)
  // plans: date -> array of sessions
  const [plans, setPlans] = useState<Record<string, SessionConfig[]>>({})
  const [modalDate, setModalDate] = useState<string | null>(null)
  const [modalSessionIdx, setModalSessionIdx] = useState<number | null>(null) // null = new session

  const weeks = useMemo(() => {
    const monday = getMondayOfWeek(new Date())
    return Array.from({ length: 4 }, (_, w) => ({
      weekNum: w + 1,
      dates: Array.from({ length: 7 }, (_, d) => addDays(monday, w * 7 + d)),
    }))
  }, [])

  const allDates = useMemo(() => weeks.flatMap(w => w.dates.map(toDateStr)), [weeks])

  useEffect(() => {
    const loaded: Record<string, SessionConfig[]> = {}
    for (const date of allDates) {
      const sessions = loadSessions(date)
      if (sessions.length > 0) loaded[date] = sessions
    }
    setPlans(loaded)

    // Bulk-sync to Supabase on load
    for (const [date, sessions] of Object.entries(loaded)) {
      sessions.forEach((config, idx) => {
        const isRest = config.sessionType === 'rest'
        const totalMeters = isRest ? null : (calcDist(config) > 0 ? calcDist(config) : null)
        fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_date: date,
            session_index: idx,
            session_type: config.sessionType || 'easy',
            description: isRest ? null : (config.name || null),
            target_distance_meters: totalMeters,
          }),
        }).then(r => { if (!r.ok) r.json().then(d => console.error('[plan sync load]', date, idx, d)) })
          .catch(e => console.error('[plan sync load]', date, idx, e))
      })
    }
  }, [allDates])

  function syncToApi(date: string, idx: number, config: SessionConfig) {
    const isRest = config.sessionType === 'rest'
    const totalMeters = calcDist(config, unit)
    fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_date: date,
        session_index: idx,
        session_type: config.sessionType || 'easy',
        description: isRest ? null : (config.name || summarizeSession(config, unit) || null),
        target_distance_meters: isRest || totalMeters <= 0 ? null : totalMeters,
      }),
    }).then(r => { if (!r.ok) r.json().then(d => console.error('[plan sync save]', date, idx, d)) })
      .catch(e => console.error('[plan sync save]', date, idx, e))
  }

  function deleteFromApi(date: string, idx: number) {
    fetch(`/api/plans?date=${date}&session_index=${idx}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) r.json().then(d => console.error('[plan sync delete]', date, idx, d)) })
      .catch(e => console.error('[plan sync delete]', date, idx, e))
  }

  function deleteAllFromApi(date: string) {
    fetch(`/api/plans?date=${date}`, { method: 'DELETE' })
      .catch(e => console.error('[plan sync delete all]', date, e))
  }

  function saveSession(date: string, idx: number | null, config: SessionConfig) {
    setPlans(prev => {
      const existing = prev[date] ?? []
      let next: SessionConfig[]
      if (idx === null) {
        // New session
        next = [...existing, config]
      } else {
        next = existing.map((s, i) => i === idx ? config : s)
      }
      saveSessions(date, next)
      next.forEach((s, i) => syncToApi(date, i, s))
      return { ...prev, [date]: next }
    })
  }

  function deleteSession(date: string, idx: number) {
    setPlans(prev => {
      const existing = prev[date] ?? []
      const next = existing.filter((_, i) => i !== idx)
      if (next.length === 0) {
        saveSessions(date, [])
        deleteAllFromApi(date)
        const updated = { ...prev }
        delete updated[date]
        return updated
      }
      // Re-index: delete all then re-sync
      saveSessions(date, next)
      deleteAllFromApi(date)
      next.forEach((s, i) => syncToApi(date, i, s))
      return { ...prev, [date]: next }
    })
  }

  function openModal(date: string, idx: number | null) {
    setModalDate(date)
    setModalSessionIdx(idx)
  }

  function weekDist(dates: Date[]): number {
    return dates.reduce((sum, d) => {
      const sessions = plans[toDateStr(d)] ?? []
      return sum + sessions.reduce((s, c) => {
        if (c.sessionType === 'rest') return s
        return s + (unit === 'miles' ? metersToMiles(calcDist(c, unit)) : calcDist(c, unit) / 1000)
      }, 0)
    }, 0)
  }

  function weekTime(dates: Date[]): number {
    return dates.reduce((sum, d) => {
      const sessions = plans[toDateStr(d)] ?? []
      return sum + sessions.reduce((s, c) => {
        if (c.sessionType === 'rest') return s
        return s + calcDuration(c, unit)
      }, 0)
    }, 0)
  }

  const modalSessions = modalDate ? (plans[modalDate] ?? []) : []
  const modalInitialConfig = modalDate
    ? (modalSessionIdx !== null ? (modalSessions[modalSessionIdx] ?? null) : null)
    : null
  const modalDisplayDate = modalDate
    ? (() => {
        const d = new Date(modalDate + 'T00:00:00')
        return `${dayAbbr(d)}, ${shortDate(d)}`
      })()
    : ''

  const monday = weeks[0]?.dates[0]
  const lastDay = weeks[3]?.dates[6]

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-4 pt-20 pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold uppercase" style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}>Training Plan</h1>
          {monday && lastDay && (
            <p className="font-mono text-xs mt-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{shortDate(monday)} – {shortDate(lastDay)}</p>
          )}
        </div>

        {/* ── DESKTOP CALENDAR (md+) ─────────────────────────────────── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                <th className="text-left py-3 px-3 w-36"></th>
                {DAY_ABBR.map(d => (
                  <th key={d} className="text-center py-3 px-2 font-medium">{d}</th>
                ))}
                <th className="text-right py-3 px-3 w-20">{unitLabel}</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const dist = weekDist(week.dates)
                const timeSecs = weekTime(week.dates)
                return (
                  <>
                    <tr key={`dates-${week.weekNum}`} className="border-t border-[var(--surface-2)]">
                      <td className="py-2 px-3">
                        <div className="text-white font-mono text-[10px] font-bold uppercase tracking-wider text-center rounded px-2 py-1 whitespace-nowrap" style={{ background: 'var(--orange)' }}>
                          {shortDate(week.dates[0])} – {shortDate(week.dates[6])}
                        </div>
                      </td>
                      {week.dates.map((d, i) => (
                        <td key={i} className={`py-2 px-2 text-center text-xs ${checkToday(d) ? 'text-[#f97316] font-bold' : 'text-[#6b7280]'}`}>
                          {shortDate(d)}
                        </td>
                      ))}
                      <td />
                    </tr>
                    <tr key={`sessions-${week.weekNum}`}>
                      <td className="pb-4 px-3" />
                      {week.dates.map((d) => {
                        const dateStr = toDateStr(d)
                        const sessions = plans[dateStr] ?? []
                        const past = isPast(d)
                        return (
                          <td key={dateStr} className={`pb-4 px-1 align-top ${past ? 'opacity-40 cursor-default pointer-events-none' : ''}`}>
                            <div className="flex flex-col gap-1 w-full max-w-[160px]">
                              {sessions.length === 0 ? (
                                <div className="w-full min-h-[56px] rounded-lg border border-dashed border-[#3a3a3a] flex flex-col items-center justify-center gap-0.5 hover:border-[#f97316]/30 transition-colors">
                                  <button
                                    onClick={() => !past && openModal(dateStr, null)}
                                    className="flex items-center gap-1 text-[10px] text-[#6b7280] hover:text-[#f97316] transition-colors px-2 py-0.5 rounded"
                                  >
                                    <Plus size={10} /> Run
                                  </button>
                                  <button
                                    onClick={() => !past && saveSession(dateStr, null, { ...defaultConfig(), sessionType: 'rest' })}
                                    className="text-[9px] text-[#4b5563] hover:text-[#6b7280] transition-colors px-2 py-0.5 rounded"
                                  >
                                    Rest
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {sessions.map((config, idx) => {
                                    const isRest = config.sessionType === 'rest'
                                    const parts = isRest ? [] : summarizeParts(config, unit)
                                    const summary = parts.map(p => p.text).join(' · ')
                                    const cellDist = !isRest && calcDist(config, unit) > 0
                                      ? (unit === 'miles' ? metersToMiles(calcDist(config, unit)).toFixed(2) : (calcDist(config, unit) / 1000).toFixed(1))
                                      : null
                                    const cellTime = !isRest ? formatSessionTime(calcDuration(config, unit)) : null
                                    const sessionMeta = !isRest ? PLAN_SESSION_TYPES.find(s => s.key === config.sessionType) : null
                                    return isRest ? (
                                      <button
                                        key={idx}
                                        onClick={() => !past && openModal(dateStr, idx)}
                                        className="w-full min-h-[40px] rounded-lg px-2 py-1.5 text-xs bg-[#150f1e] border border-[#3b2060] flex flex-col items-center justify-center gap-0.5 text-[#7c5fa8] hover:text-[#a78bfa] hover:border-[#5b3090] transition-colors group"
                                      >
                                        <Moon size={11} className="opacity-50 group-hover:opacity-70" />
                                        <span>Rest</span>
                                      </button>
                                    ) : (
                                      <button
                                        key={idx}
                                        onClick={() => !past && openModal(dateStr, idx)}
                                        className="w-full min-h-[48px] rounded-lg px-2 py-2 text-left text-xs leading-tight transition-all text-white hover:ring-1 hover:ring-[#f97316]/50 hover:brightness-110" style={{ background: 'var(--surface-2)' }}
                                      >
                                        <div className="font-medium">{config.name || <span className="text-[#6b7280] italic">Untitled</span>}</div>
                                        {sessionMeta && (
                                          <div className="flex items-center gap-1 mt-0.5">
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sessionMeta.color}`} />
                                            <span className="text-[#9ca3af] text-[10px]">{sessionMeta.label}</span>
                                          </div>
                                        )}
                                        {summary && (
                                          <div className="text-[#6b7280] mt-0.5 text-[10px] leading-relaxed">{summary}</div>
                                        )}
                                        {(cellDist || cellTime) && (
                                          <div className="text-[#4b5563] mt-1 text-[10px] font-mono">
                                            {cellDist && `${cellDist} ${unitLabel}`}{cellDist && cellTime && ' · '}{cellTime}
                                          </div>
                                        )}
                                      </button>
                                    )
                                  })}
                                  {/* Add another run button — only show if no rest day */}
                                  {!sessions.some(s => s.sessionType === 'rest') && (
                                    <button
                                      onClick={() => !past && openModal(dateStr, null)}
                                      className="w-full rounded-md py-0.5 text-[9px] text-[#4b5563] hover:text-[#f97316] border border-dashed border-[#2a2a2a] hover:border-[#f97316]/30 flex items-center justify-center gap-0.5 transition-colors"
                                    >
                                      <Plus size={8} /> Add run
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        )
                      })}
                      <td className="pb-4 px-3 align-middle">
                        <div className="text-right">
                          {dist > 0 ? (
                            <>
                              <div className="font-mono font-bold text-[#f97316] text-sm">{dist.toFixed(1)}</div>
                              <div className="font-mono text-[#6b7280] text-xs">{formatSessionTime(timeSecs)}</div>
                            </>
                          ) : (
                            <span className="text-[#2a2a2a] text-sm">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── MOBILE VERTICAL LIST (<md) ─────────────────────────────── */}
        <div className="md:hidden space-y-8">
          {weeks.map((week) => {
            const dist = weekDist(week.dates)
            const timeSecs = weekTime(week.dates)
            return (
              <div key={week.weekNum}>
                <div className="flex items-center justify-between mb-3">
                  <span className="bg-[#f97316] text-white text-xs font-bold rounded px-2 py-1">
                    {shortDate(week.dates[0])} – {shortDate(week.dates[6])}
                  </span>
                  {dist > 0 && (
                    <span className="font-mono text-sm text-right">
                      <span className="font-bold text-[#f97316]">{dist.toFixed(1)} {unitLabel}</span>
                      <span className="text-[#6b7280]"> · {formatSessionTime(timeSecs)}</span>
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {week.dates.map((d) => {
                    const dateStr = toDateStr(d)
                    const sessions = plans[dateStr] ?? []
                    const isDay = checkToday(d)
                    const past = isPast(d)

                    const dateCol = (
                      <div className="w-14 shrink-0 pt-0.5">
                        <div className={`text-xs font-bold ${isDay ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>{dayAbbr(d)}</div>
                        <div className={`text-xs ${isDay ? 'text-[#f97316]/70' : 'text-[#4b5563]'}`}>{shortDate(d)}</div>
                      </div>
                    )

                    if (sessions.length === 0) {
                      return (
                        <div key={dateStr} className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border border-dashed border-[#2a2a2a] ${past ? 'opacity-40 pointer-events-none' : ''}`}>
                          {dateCol}
                          <div className="flex-1 flex items-center gap-3 pt-0.5">
                            <button
                              onClick={() => !past && openModal(dateStr, null)}
                              className="flex items-center gap-1.5 text-xs text-[#4b5563] hover:text-[#f97316] transition-colors"
                            >
                              <Plus size={13} className="shrink-0" /> Run
                            </button>
                            <span className="text-[#2a2a2a] text-xs">·</span>
                            <button
                              onClick={() => !past && saveSession(dateStr, null, { ...defaultConfig(), sessionType: 'rest' })}
                              className="text-xs text-[#4b5563] hover:text-[#6b7280] transition-colors"
                            >
                              Rest
                            </button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={dateStr} className={`space-y-1.5 ${past ? 'opacity-40 pointer-events-none' : ''}`}>
                        {sessions.map((config, idx) => {
                          const isRest = config.sessionType === 'rest'
                          const parts: SummaryPart[] = !isRest ? summarizeParts(config, unit) : []
                          const distVal = !isRest && calcDist(config, unit) > 0
                            ? (unit === 'miles' ? metersToMiles(calcDist(config, unit)).toFixed(2) : (calcDist(config, unit) / 1000).toFixed(1))
                            : null
                          const timeVal = !isRest ? formatSessionTime(calcDuration(config, unit)) : null
                          const sessionMeta = !isRest ? PLAN_SESSION_TYPES.find(s => s.key === config.sessionType) : null

                          if (isRest) {
                            return (
                              <button
                                key={idx}
                                onClick={() => !past && openModal(dateStr, idx)}
                                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 bg-[#150f1e] border border-[#3b2060] text-left hover:border-[#5b3090] transition-colors"
                              >
                                {idx === 0 ? dateCol : <div className="w-14 shrink-0" />}
                                <div className="flex-1 flex items-center gap-2 text-[#7c5fa8]">
                                  <Moon size={13} className="shrink-0" />
                                  <span className="text-xs">Rest day</span>
                                </div>
                              </button>
                            )
                          }

                          return (
                            <button
                              key={idx}
                              onClick={() => !past && openModal(dateStr, idx)}
                              className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all hover:brightness-110" style={{ background: 'var(--surface)' }}
                            >
                              {idx === 0 ? dateCol : <div className="w-14 shrink-0" />}
                              <div className="w-28 shrink-0 pt-0.5">
                                <div className="text-sm font-medium text-white leading-snug">{config.name || <span className="text-[#6b7280] italic text-xs">Untitled</span>}</div>
                                {sessionMeta && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sessionMeta.color}`} />
                                    <span className="text-[#9ca3af] text-xs">{sessionMeta.label}</span>
                                  </div>
                                )}
                                {distVal && distVal !== '0.0' && distVal !== '0.00' && (
                                  <div className="text-xs text-[#f97316]/70 font-mono mt-0.5">{distVal} {unitLabel}</div>
                                )}
                                {timeVal && (
                                  <div className="text-xs text-[#6b7280] font-mono">{timeVal}</div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5 space-y-0.5">
                                {parts.length > 0
                                  ? parts.map((p, i) => (
                                      <div key={i} className={`text-xs ${p.color}`}>{p.text}</div>
                                    ))
                                  : <div className="text-xs text-[#4b5563] italic">No blocks added</div>
                                }
                              </div>
                            </button>
                          )
                        })}
                        {/* Add another run — only if no rest */}
                        {!past && !sessions.some(s => s.sessionType === 'rest') && (
                          <button
                            onClick={() => openModal(dateStr, null)}
                            className="w-full flex items-center gap-2 rounded-xl px-4 py-2 border border-dashed border-[#2a2a2a] hover:border-[#f97316]/30 text-[#4b5563] hover:text-[#f97316] transition-colors"
                          >
                            <Plus size={12} />
                            <span className="text-xs">Add another run</span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {modalDate && (
        <PlanSessionModal
          displayDate={modalDisplayDate}
          initialConfig={modalInitialConfig}
          onClose={() => { setModalDate(null); setModalSessionIdx(null) }}
          onSave={(config) => {
            saveSession(modalDate, modalSessionIdx, config)
          }}
          onDelete={modalSessionIdx !== null ? () => {
            deleteSession(modalDate, modalSessionIdx)
            setModalDate(null)
            setModalSessionIdx(null)
          } : undefined}
        />
      )}
    </>
  )
}
