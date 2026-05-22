'use client'
import { useState, useEffect, useMemo } from 'react'
import Nav from '@/components/Nav'
import PlanSessionModal, { SessionConfig, calcDist, calcDuration, summarizeParts, summarizeSession, SummaryPart, defaultConfig } from '@/components/PlanSessionModal'
import { PLAN_SESSION_TYPES } from '@/lib/planTypes'
import { Plus, Moon } from 'lucide-react'
import { useUnit } from '@/lib/unit-context'
import { distanceUnitLabel, metersToMiles } from '@/lib/utils'

const DAY_ABBR = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(date: Date, n: number): Date { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function toDateStr(d: Date): string { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
function shortDate(d: Date): string { return `${MONTHS[d.getMonth()]} ${d.getDate()}` }
function dayAbbr(d: Date): string { const day = d.getDay(); return DAY_ABBR[day === 0 ? 6 : day - 1] }
function checkToday(d: Date): boolean { const now = new Date(); return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }
function isPast(d: Date): boolean { const today = new Date(); today.setHours(0, 0, 0, 0); const t = new Date(d); t.setHours(0, 0, 0, 0); return t < today }
function formatSessionTime(secs: number): string { const h = Math.floor(secs / 3600); const m = Math.round((secs % 3600) / 60); if (h > 0) return `${h}h ${m}min`; return `${m}min` }

const SESSIONS_KEY = (date: string) => `plan_sessions_v3_${date}`
const SYNC_SIG_KEY = (date: string) => `plan_sessions_sync_sig_v1_${date}`
const LEGACY_RUN_KEY = (date: string) => `plan_v2_${date}`
const LEGACY_REST_KEY = (date: string) => `plan_rest_v1_${date}`

function sessionSignature(sessions: SessionConfig[]): string { return JSON.stringify(sessions) }

function loadSessions(date: string): SessionConfig[] {
  try {
    const s = localStorage.getItem(SESSIONS_KEY(date))
    if (s) return JSON.parse(s)
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
    if (sessions.length === 0) { localStorage.removeItem(SESSIONS_KEY(date)); localStorage.removeItem(SYNC_SIG_KEY(date)) }
    else localStorage.setItem(SESSIONS_KEY(date), JSON.stringify(sessions))
  } catch {}
}
function loadSyncSignature(date: string): string | null { try { return localStorage.getItem(SYNC_SIG_KEY(date)) } catch { return null } }
function markSynced(date: string, sessions: SessionConfig[]) { try { localStorage.setItem(SYNC_SIG_KEY(date), sessionSignature(sessions)) } catch {} }

// ── Pulse session-type color mapper ────────────────────────────────────
// Returns the stripe accent for a session type. Anything tempo/threshold
// gets acid; intervals/race get magenta; long gets ice; everything else
// muted. Mirrors RUN_TYPES exactly.
function sessionAccent(type: string | undefined): string {
  if (!type) return 'var(--fg-3)'
  if (type === 'tempo' || type === 'threshold') return 'var(--acid)'
  if (type === 'intervals' || type === 'race') return 'var(--magenta)'
  if (type.startsWith('long')) return 'var(--ice)'
  if (type === 'rest') return 'var(--fg-4)'
  return 'var(--fg-2)'
}

export default function PlanPage() {
  const { unit } = useUnit()
  const unitLabel = distanceUnitLabel(unit)
  const [plans, setPlans] = useState<Record<string, SessionConfig[]>>({})
  const [modalDate, setModalDate] = useState<string | null>(null)
  const [modalSessionIdx, setModalSessionIdx] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  const weeks = useMemo(() => {
    const monday = getMondayOfWeek(new Date())
    return Array.from({ length: 4 }, (_, w) => ({
      weekNum: w + 1,
      dates: Array.from({ length: 7 }, (_, d) => addDays(monday, w * 7 + d)),
    }))
  }, [])
  const allDates = useMemo(() => weeks.flatMap(w => w.dates.map(toDateStr)), [weeks])

  async function syncSessionsToApi(date: string, sessions: SessionConfig[]) {
    if (sessions.length === 0) {
      try { await fetch(`/api/plans?date=${date}`, { method: 'DELETE' }); markSynced(date, sessions) }
      catch (e) { console.error('[plan sync delete all]', date, e) }
      return
    }
    try {
      await fetch(`/api/plans?date=${date}`, { method: 'DELETE' })
      const responses = await Promise.all(sessions.map((config, idx) => {
        const isRest = config.sessionType === 'rest'
        const totalMeters = calcDist(config, unit)
        return fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_date: date, session_index: idx, session_type: config.sessionType || 'easy',
            description: isRest ? null : (config.name || summarizeSession(config, unit) || null),
            target_distance_meters: isRest || totalMeters <= 0 ? null : totalMeters,
          }),
        })
      }))
      for (const response of responses) { if (!response.ok) { console.error('[plan sync save]', date, await response.text()); return } }
      markSynced(date, sessions)
    } catch (e) { console.error('[plan sync save]', date, e) }
  }
  function persistSessions(date: string, sessions: SessionConfig[]) { saveSessions(date, sessions); void syncSessionsToApi(date, sessions) }

  useEffect(() => {
    const loadedPlans: Record<string, SessionConfig[]> = {}
    for (const date of allDates) {
      const sessions = loadSessions(date)
      if (sessions.length > 0) loadedPlans[date] = sessions
    }
    setPlans(loadedPlans); setLoaded(true)
    for (const [date, sessions] of Object.entries(loadedPlans)) {
      if (loadSyncSignature(date) !== sessionSignature(sessions)) { void syncSessionsToApi(date, sessions) }
    }
  }, [allDates])

  function saveSession(date: string, idx: number | null, config: SessionConfig) {
    setPlans(prev => {
      const existing = prev[date] ?? []
      const next = idx === null ? [...existing, config] : existing.map((s, i) => i === idx ? config : s)
      persistSessions(date, next)
      return { ...prev, [date]: next }
    })
  }
  function deleteSession(date: string, idx: number) {
    setPlans(prev => {
      const existing = prev[date] ?? []
      const next = existing.filter((_, i) => i !== idx)
      if (next.length === 0) { persistSessions(date, []); const updated = { ...prev }; delete updated[date]; return updated }
      persistSessions(date, next)
      return { ...prev, [date]: next }
    })
  }
  function openModal(date: string, idx: number | null) { setModalDate(date); setModalSessionIdx(idx) }
  function weekDist(dates: Date[]): number { return dates.reduce((sum, d) => { const sessions = plans[toDateStr(d)] ?? []; return sum + sessions.reduce((s, c) => { if (c.sessionType === 'rest') return s; return s + (unit === 'miles' ? metersToMiles(calcDist(c, unit)) : calcDist(c, unit) / 1000) }, 0) }, 0) }
  function weekTime(dates: Date[]): number { return dates.reduce((sum, d) => { const sessions = plans[toDateStr(d)] ?? []; return sum + sessions.reduce((s, c) => { if (c.sessionType === 'rest') return s; return s + calcDuration(c, unit) }, 0) }, 0) }

  const modalSessions = modalDate ? (plans[modalDate] ?? []) : []
  const modalInitialConfig = modalDate ? (modalSessionIdx !== null ? (modalSessions[modalSessionIdx] ?? null) : null) : null
  const modalDisplayDate = modalDate ? (() => { const d = new Date(modalDate + 'T00:00:00'); return `${dayAbbr(d)}, ${shortDate(d)}` })() : ''

  const monday = weeks[0]?.dates[0]
  const lastDay = weeks[3]?.dates[6]

  if (!loaded) {
    return (
      <>
        <Nav />
        <main className="standalone-main max-w-6xl mx-auto px-4 pt-8 sm:pt-20 pb-24 sm:pb-16">
          <div className="mb-8 fade-up pb-6" style={{ borderBottom: '2px solid var(--fg-1)' }}>
            <h1 className="font-display font-bold uppercase" style={{ fontSize: 'clamp(40px, 7vw, 72px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}>
              TRAINING PLAN<span style={{ color: 'var(--magenta)' }}>.</span>
            </h1>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-4 pt-8 sm:pt-20 pb-24 sm:pb-16">
        <div className="mb-8 fade-up pb-6" style={{ borderBottom: '2px solid var(--fg-1)' }}>
          <h1 className="font-display font-bold uppercase" style={{ fontSize: 'clamp(40px, 7vw, 72px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}>
            TRAINING PLAN<span style={{ color: 'var(--magenta)' }}>.</span>
          </h1>
          {monday && lastDay && (
            <p className="pulse-label mt-3">{shortDate(monday)} – {shortDate(lastDay)} · 4 WEEK BLOCK</p>
          )}
        </div>

        {/* ── DESKTOP CALENDAR (md+) ──────────────────────────────────── */}
        <div className="hidden md:block card pulse-bar" style={{ padding: 0 }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--fg-1)' }}>
                  <th className="text-left py-3 px-4 w-44 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>WEEK</th>
                  {DAY_ABBR.map(d => (
                    <th key={d} className="text-center py-3 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>{d}</th>
                  ))}
                  <th className="text-right py-3 px-4 w-20 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>{unitLabel.toUpperCase()}</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => {
                  const dist = weekDist(week.dates)
                  const timeSecs = weekTime(week.dates)
                  return (
                    <tr key={`row-${week.weekNum}`} style={{ borderTop: '1px solid var(--hair-1)' }}>
                      <td className="py-3 px-4 align-top">
                        <div
                          className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1.5 whitespace-nowrap inline-block"
                          style={{ background: 'var(--magenta)', color: 'var(--ink)' }}
                        >
                          {shortDate(week.dates[0])} – {shortDate(week.dates[6])}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] mt-2" style={{ color: 'var(--fg-4)' }}>WEEK {week.weekNum}</div>
                      </td>
                      {week.dates.map((d) => {
                        const dateStr = toDateStr(d)
                        const sessions = plans[dateStr] ?? []
                        const past = isPast(d)
                        return (
                          <td key={dateStr} className={`pb-3 px-1 pt-2 align-top ${past ? 'opacity-40 cursor-default pointer-events-none' : ''}`}>
                            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-center mb-1.5" style={{ color: checkToday(d) ? 'var(--magenta)' : 'var(--fg-3)', fontWeight: checkToday(d) ? 700 : 500 }}>
                              {shortDate(d)}
                            </div>
                            <div className="flex flex-col gap-1 w-full max-w-[160px] mx-auto">
                              {sessions.length === 0 ? (
                                <div className="w-full min-h-[64px] flex flex-col items-center justify-center gap-0.5 hover:bg-[var(--ink-2)] transition-colors" style={{ border: '1px dashed var(--hair-1)' }}>
                                  <button onClick={() => !past && openModal(dateStr, null)} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] px-2 py-0.5 transition-colors" style={{ color: 'var(--fg-3)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--magenta)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-3)'}>
                                    <Plus size={10} /> RUN
                                  </button>
                                  <button onClick={() => !past && saveSession(dateStr, null, { ...defaultConfig(), sessionType: 'rest' })} className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5" style={{ color: 'var(--fg-4)' }}>
                                    REST
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {sessions.map((config, idx) => {
                                    const isRest = config.sessionType === 'rest'
                                    const parts = isRest ? [] : summarizeParts(config, unit)
                                    const summary = parts.map(p => p.text).join(' · ')
                                    const cellDist = !isRest && calcDist(config, unit) > 0 ? (unit === 'miles' ? metersToMiles(calcDist(config, unit)).toFixed(2) : (calcDist(config, unit) / 1000).toFixed(1)) : null
                                    const cellTime = !isRest ? formatSessionTime(calcDuration(config, unit)) : null
                                    const sessionMeta = !isRest ? PLAN_SESSION_TYPES.find(s => s.key === config.sessionType) : null
                                    const accent = sessionAccent(config.sessionType)
                                    const isRace = config.sessionType === 'race'
                                    return isRest ? (
                                      <button key={idx} onClick={() => !past && openModal(dateStr, idx)} className="w-full min-h-[48px] px-2 py-2 text-xs flex flex-col items-center justify-center gap-1 transition-colors group" style={{ background: 'var(--ink-1)', border: '1px solid var(--hair-1)', color: 'var(--fg-3)' }}>
                                        <Moon size={11} className="opacity-50" />
                                        <span className="font-mono text-[10px] uppercase tracking-[0.16em]">REST</span>
                                      </button>
                                    ) : (
                                      <button key={idx} onClick={() => !past && openModal(dateStr, idx)} className="w-full min-h-[56px] px-2 py-2 text-left text-xs leading-tight transition-all relative" style={{ background: isRace ? 'var(--magenta)' : 'var(--ink-2)', color: isRace ? 'var(--ink)' : 'var(--fg-1)' }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent }} />
                                        <div className="font-display font-bold uppercase text-[11px]" style={{ letterSpacing: '-0.005em', marginTop: 2 }}>{config.name || 'UNTITLED'}</div>
                                        {sessionMeta && (
                                          <div className="font-mono text-[9px] uppercase tracking-[0.14em] mt-1" style={{ color: isRace ? 'rgba(0,0,0,0.6)' : 'var(--fg-3)' }}>
                                            {sessionMeta.label}
                                          </div>
                                        )}
                                        {summary && (
                                          <div className="font-mono text-[9px] mt-0.5 leading-relaxed" style={{ color: isRace ? 'rgba(0,0,0,0.5)' : 'var(--fg-3)' }}>{summary}</div>
                                        )}
                                        {(cellDist || cellTime) && (
                                          <div className="font-mono text-[9px] mt-1" style={{ color: isRace ? 'rgba(0,0,0,0.5)' : 'var(--fg-3)' }}>
                                            {cellDist && `${cellDist} ${unitLabel}`}{cellDist && cellTime && ' · '}{cellTime}
                                          </div>
                                        )}
                                      </button>
                                    )
                                  })}
                                  {!sessions.some(s => s.sessionType === 'rest') && (
                                    <button onClick={() => !past && openModal(dateStr, null)} className="w-full py-1 font-mono text-[9px] uppercase tracking-[0.14em] flex items-center justify-center gap-0.5 transition-colors" style={{ border: '1px dashed var(--hair-1)', color: 'var(--fg-4)' }}>
                                      <Plus size={8} /> ADD
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        )
                      })}
                      <td className="pb-3 px-4 align-middle text-right">
                        {dist > 0 ? (
                          <>
                            <div className="font-mono font-bold" style={{ color: 'var(--magenta)', fontSize: 14 }}>{dist.toFixed(1)}</div>
                            <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--fg-3)' }}>{formatSessionTime(timeSecs)}</div>
                          </>
                        ) : (
                          <span className="font-mono text-sm" style={{ color: 'var(--fg-4)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── MOBILE VERTICAL LIST (<md) ──────────────────────────────── */}
        <div className="md:hidden space-y-8">
          {weeks.map((week) => {
            const dist = weekDist(week.dates)
            const timeSecs = weekTime(week.dates)
            return (
              <div key={week.weekNum}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1.5" style={{ background: 'var(--magenta)', color: 'var(--ink)' }}>
                    {shortDate(week.dates[0])} – {shortDate(week.dates[6])}
                  </span>
                  {dist > 0 && (
                    <span className="font-mono text-sm text-right">
                      <span className="font-bold" style={{ color: 'var(--magenta)' }}>{dist.toFixed(1)} {unitLabel.toUpperCase()}</span>
                      <span style={{ color: 'var(--fg-3)' }}> · {formatSessionTime(timeSecs)}</span>
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
                        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: isDay ? 'var(--magenta)' : 'var(--fg-3)' }}>{dayAbbr(d)}</div>
                        <div className="font-mono text-[10px]" style={{ color: isDay ? 'var(--magenta)' : 'var(--fg-4)' }}>{shortDate(d)}</div>
                      </div>
                    )

                    if (sessions.length === 0) {
                      return (
                        <div key={dateStr} className={`w-full flex items-center gap-3 px-4 py-3 ${past ? 'opacity-40 pointer-events-none' : ''}`} style={{ border: '1px dashed var(--hair-1)' }}>
                          {dateCol}
                          <div className="flex-1 flex items-center gap-3 pt-0.5">
                            <button onClick={() => !past && openModal(dateStr, null)} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--fg-3)' }}>
                              <Plus size={12} className="shrink-0" /> RUN
                            </button>
                            <span className="text-[10px]" style={{ color: 'var(--fg-4)' }}>·</span>
                            <button onClick={() => !past && saveSession(dateStr, null, { ...defaultConfig(), sessionType: 'rest' })} className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--fg-4)' }}>REST</button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={dateStr} className={`space-y-1.5 ${past ? 'opacity-40 pointer-events-none' : ''}`}>
                        {sessions.map((config, idx) => {
                          const isRest = config.sessionType === 'rest'
                          const parts: SummaryPart[] = !isRest ? summarizeParts(config, unit) : []
                          const distVal = !isRest && calcDist(config, unit) > 0 ? (unit === 'miles' ? metersToMiles(calcDist(config, unit)).toFixed(2) : (calcDist(config, unit) / 1000).toFixed(1)) : null
                          const timeVal = !isRest ? formatSessionTime(calcDuration(config, unit)) : null
                          const sessionMeta = !isRest ? PLAN_SESSION_TYPES.find(s => s.key === config.sessionType) : null
                          const accent = sessionAccent(config.sessionType)
                          const isRace = config.sessionType === 'race'

                          if (isRest) {
                            return (
                              <button key={idx} onClick={() => !past && openModal(dateStr, idx)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ background: 'var(--ink-1)', border: '1px solid var(--hair-1)' }}>
                                {idx === 0 ? dateCol : <div className="w-14 shrink-0" />}
                                <div className="flex-1 flex items-center gap-2" style={{ color: 'var(--fg-3)' }}>
                                  <Moon size={13} className="shrink-0" />
                                  <span className="font-mono text-[10px] uppercase tracking-[0.16em]">REST DAY</span>
                                </div>
                              </button>
                            )
                          }

                          return (
                            <button key={idx} onClick={() => !past && openModal(dateStr, idx)} className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all relative" style={{ background: isRace ? 'var(--magenta)' : 'var(--ink-1)', color: isRace ? 'var(--ink)' : 'var(--fg-1)' }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: accent }} />
                              {idx === 0 ? dateCol : <div className="w-14 shrink-0" />}
                              <div className="w-28 shrink-0 pt-0.5">
                                <div className="font-display font-bold uppercase text-sm leading-snug" style={{ letterSpacing: '-0.005em' }}>{config.name || 'UNTITLED'}</div>
                                {sessionMeta && (
                                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] mt-0.5" style={{ color: isRace ? 'rgba(0,0,0,0.6)' : 'var(--fg-3)' }}>{sessionMeta.label}</div>
                                )}
                                {distVal && distVal !== '0.0' && distVal !== '0.00' && (
                                  <div className="font-mono text-[10px] mt-0.5" style={{ color: isRace ? 'rgba(0,0,0,0.6)' : 'var(--magenta)' }}>{distVal} {unitLabel.toUpperCase()}</div>
                                )}
                                {timeVal && (
                                  <div className="font-mono text-[10px]" style={{ color: isRace ? 'rgba(0,0,0,0.5)' : 'var(--fg-3)' }}>{timeVal}</div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5 space-y-0.5">
                                {parts.length > 0
                                  ? parts.map((p, i) => (<div key={i} className={`text-xs font-mono ${p.color}`}>{p.text}</div>))
                                  : <div className="font-mono text-[10px] italic" style={{ color: 'var(--fg-4)' }}>No blocks added</div>
                                }
                              </div>
                            </button>
                          )
                        })}
                        {!past && !sessions.some(s => s.sessionType === 'rest') && (
                          <button onClick={() => openModal(dateStr, null)} className="w-full flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors" style={{ border: '1px dashed var(--hair-1)', color: 'var(--fg-4)' }}>
                            <Plus size={12} />
                            <span>ADD RUN</span>
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
          onSave={(config) => { saveSession(modalDate, modalSessionIdx, config) }}
          onDelete={modalSessionIdx !== null ? () => { deleteSession(modalDate, modalSessionIdx); setModalDate(null); setModalSessionIdx(null) } : undefined}
        />
      )}
    </>
  )
}
