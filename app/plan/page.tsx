'use client'
import { useState, useEffect, useMemo } from 'react'
import Nav from '@/components/Nav'
import PlanSessionModal, { SessionConfig, calcDist, summarizeSession } from '@/components/PlanSessionModal'
import { Plus } from 'lucide-react'

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

const STORAGE_KEY = (date: string) => `plan_v2_${date}`

export default function PlanPage() {
  const [plans, setPlans] = useState<Record<string, SessionConfig>>({})
  const [modalDate, setModalDate] = useState<string | null>(null)

  const weeks = useMemo(() => {
    const monday = getMondayOfWeek(new Date())
    return Array.from({ length: 4 }, (_, w) => ({
      weekNum: w + 1,
      dates: Array.from({ length: 7 }, (_, d) => addDays(monday, w * 7 + d)),
    }))
  }, [])

  const allDates = useMemo(() => weeks.flatMap(w => w.dates.map(toDateStr)), [weeks])

  useEffect(() => {
    const loaded: Record<string, SessionConfig> = {}
    for (const date of allDates) {
      try {
        const s = localStorage.getItem(STORAGE_KEY(date))
        if (s) loaded[date] = JSON.parse(s)
      } catch {}
    }
    setPlans(loaded)
  }, [allDates])

  function savePlan(date: string, config: SessionConfig) {
    setPlans(prev => ({ ...prev, [date]: config }))
    try { localStorage.setItem(STORAGE_KEY(date), JSON.stringify(config)) } catch {}
  }

  function deletePlan(date: string) {
    setPlans(prev => { const next = { ...prev }; delete next[date]; return next })
    try { localStorage.removeItem(STORAGE_KEY(date)) } catch {}
  }

  function weekKm(dates: Date[]): number {
    return dates.reduce((sum, d) => {
      const c = plans[toDateStr(d)]
      return sum + (c ? calcDist(c) / 1000 : 0)
    }, 0)
  }

  const modalConfig = modalDate ? (plans[modalDate] ?? null) : null
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
      <main className="standalone-main max-w-6xl mx-auto px-4 pt-8 sm:pt-20 pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold text-4xl mb-1">Training Plan</h1>
          {monday && lastDay && (
            <p className="text-[#6b7280] text-sm">{shortDate(monday)} – {shortDate(lastDay)}</p>
          )}
        </div>

        {/* ── DESKTOP CALENDAR (md+) ─────────────────────────────────── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[#6b7280] text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-3 w-14">Wk</th>
                {DAY_ABBR.map(d => (
                  <th key={d} className="text-center py-3 px-2 font-medium">{d}</th>
                ))}
                <th className="text-right py-3 px-3 w-16">km</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const km = weekKm(week.dates)
                return (
                  <>
                    <tr key={`dates-${week.weekNum}`} className="border-t border-[#1c1c1c]">
                      <td className="py-2 px-3">
                        <div className="bg-[#f97316] text-white text-xs font-bold text-center rounded px-2 py-1 w-10">
                          W{week.weekNum}
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
                        const config = plans[dateStr]
                        const summary = config ? summarizeSession(config) : ''
                        return (
                          <td key={dateStr} className="pb-4 px-1 align-top">
                            <button
                              onClick={() => setModalDate(dateStr)}
                              className={`w-full min-h-[56px] rounded-lg px-2 py-2 text-left text-xs leading-tight transition-all group ${
                                config
                                  ? 'bg-[#1a1a1a] text-white hover:ring-1 hover:ring-[#f97316]/50 hover:brightness-110'
                                  : 'border border-dashed border-[#2a2a2a] text-[#4b5563] hover:border-[#f97316]/40 hover:text-[#f97316] flex items-center justify-center'
                              }`}
                            >
                              {config ? (
                                <>
                                  <div className="font-medium truncate">{config.name || <span className="text-[#6b7280] italic">Untitled</span>}</div>
                                  {summary && (
                                    <div className="text-[#6b7280] mt-0.5 text-[10px] leading-relaxed line-clamp-2">{summary}</div>
                                  )}
                                </>
                              ) : (
                                <Plus size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                              )}
                            </button>
                          </td>
                        )
                      })}
                      <td className="pb-4 px-3 text-right align-middle">
                        {km > 0
                          ? <span className="font-mono font-bold text-[#f97316] text-sm">{km.toFixed(1)}</span>
                          : <span className="text-[#2a2a2a] text-sm">—</span>}
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
            const km = weekKm(week.dates)
            return (
              <div key={week.weekNum}>
                {/* Week header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#f97316] text-white text-xs font-bold rounded px-2 py-1">W{week.weekNum}</span>
                    <span className="text-[#6b7280] text-xs">
                      {shortDate(week.dates[0])} – {shortDate(week.dates[6])}
                    </span>
                  </div>
                  {km > 0 && (
                    <span className="font-mono font-bold text-[#f97316] text-sm">{km.toFixed(1)} km</span>
                  )}
                </div>

                {/* Day rows */}
                <div className="space-y-2">
                  {week.dates.map((d) => {
                    const dateStr = toDateStr(d)
                    const config = plans[dateStr]
                    const isDay = checkToday(d)
                    const summary = config ? summarizeSession(config) : ''
                    const distKm = config ? (calcDist(config) / 1000).toFixed(1) : null

                    return (
                      <button
                        key={dateStr}
                        onClick={() => setModalDate(dateStr)}
                        className={`w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                          config
                            ? 'bg-[#141414] hover:brightness-110'
                            : 'border border-dashed border-[#2a2a2a] hover:border-[#f97316]/40'
                        }`}
                      >
                        {/* Date column */}
                        <div className="w-14 shrink-0 pt-0.5">
                          <div className={`text-xs font-bold ${isDay ? 'text-[#f97316]' : 'text-[#6b7280]'}`}>{dayAbbr(d)}</div>
                          <div className={`text-xs ${isDay ? 'text-[#f97316]/70' : 'text-[#4b5563]'}`}>{shortDate(d)}</div>
                        </div>

                        {config ? (
                          <>
                            {/* Name + km */}
                            <div className="w-32 shrink-0 pt-0.5">
                              <div className="text-sm font-medium text-white leading-snug">{config.name || <span className="text-[#6b7280] italic text-xs">Untitled</span>}</div>
                              {distKm && distKm !== '0.00' && (
                                <div className="text-xs text-[#f97316]/70 font-mono mt-0.5">{distKm} km</div>
                              )}
                            </div>
                            {/* Session summary */}
                            <div className="flex-1 min-w-0 pt-0.5">
                              {summary
                                ? <div className="text-xs text-[#6b7280] leading-relaxed">{summary}</div>
                                : <div className="text-xs text-[#4b5563] italic">No blocks added</div>
                              }
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex items-center gap-2 text-[#4b5563] pt-0.5">
                            <Plus size={13} className="shrink-0" />
                            <span className="text-xs">Add run</span>
                          </div>
                        )}
                      </button>
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
          initialConfig={modalConfig}
          onClose={() => setModalDate(null)}
          onSave={(config) => savePlan(modalDate, config)}
          onDelete={() => { deletePlan(modalDate); setModalDate(null) }}
        />
      )}
    </>
  )
}
