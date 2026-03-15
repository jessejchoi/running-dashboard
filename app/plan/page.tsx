'use client'
import { useState, useEffect, useMemo } from 'react'
import Nav from '@/components/Nav'
import PlanSessionModal, { SessionConfig, calcDist, calcDuration, summarizeParts, SummaryPart } from '@/components/PlanSessionModal'
import { Plus } from 'lucide-react'
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

const STORAGE_KEY = (date: string) => `plan_v2_${date}`

export default function PlanPage() {
  const { unit } = useUnit()
  const unitLabel = distanceUnitLabel(unit)
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

  function weekDist(dates: Date[]): number {
    return dates.reduce((sum, d) => {
      const c = plans[toDateStr(d)]
      return sum + (c ? (unit === 'miles' ? metersToMiles(calcDist(c, unit)) : calcDist(c, unit) / 1000) : 0)
    }, 0)
  }

  function weekTime(dates: Date[]): number {
    return dates.reduce((sum, d) => {
      const c = plans[toDateStr(d)]
      return sum + (c ? calcDuration(c, unit) : 0)
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
                    <tr key={`dates-${week.weekNum}`} className="border-t border-[#1c1c1c]">
                      <td className="py-2 px-3">
                        <div className="bg-[#f97316] text-white text-xs font-bold text-center rounded px-2 py-1 whitespace-nowrap">
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
                        const config = plans[dateStr]
                        const parts = config ? summarizeParts(config, unit) : []
                        const summary = parts.map(p => p.text).join(' · ')
                        const past = isPast(d)
                        const cellDist = config ? (unit === 'miles' ? metersToMiles(calcDist(config, unit)).toFixed(2) : (calcDist(config, unit) / 1000).toFixed(1)) : null
                        const cellTime = config ? formatSessionTime(calcDuration(config, unit)) : null
                        return (
                          <td key={dateStr} className={`pb-4 px-1 align-top ${past ? 'opacity-40 cursor-default pointer-events-none' : ''}`}>
                            <button
                              onClick={() => !past && setModalDate(dateStr)}
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
                                  {(cellDist || cellTime) && (
                                    <div className="text-[#4b5563] mt-1 text-[10px] font-mono">
                                      {cellDist && `${cellDist} ${unitLabel}`}{cellDist && cellTime && ' · '}{cellTime}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <Plus size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                              )}
                            </button>
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
                {/* Week header */}
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

                {/* Day rows */}
                <div className="space-y-2">
                  {week.dates.map((d) => {
                    const dateStr = toDateStr(d)
                    const config = plans[dateStr]
                    const isDay = checkToday(d)
                    const past = isPast(d)
                    const parts: SummaryPart[] = config ? summarizeParts(config, unit) : []
                    const distVal = config ? (unit === 'miles' ? metersToMiles(calcDist(config, unit)).toFixed(2) : (calcDist(config, unit) / 1000).toFixed(1)) : null
                    const timeVal = config ? formatSessionTime(calcDuration(config, unit)) : null

                    return (
                      <button
                        key={dateStr}
                        onClick={() => !past && setModalDate(dateStr)}
                        className={`w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all ${past ? 'opacity-40 pointer-events-none' : ''} ${
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
                            {/* Name + dist + time */}
                            <div className="w-20 shrink-0 pt-0.5">
                              <div className="text-sm font-medium text-white leading-snug">{config.name || <span className="text-[#6b7280] italic text-xs">Untitled</span>}</div>
                              {distVal && distVal !== '0.0' && distVal !== '0.00' && (
                                <div className="text-xs text-[#f97316]/70 font-mono mt-0.5">{distVal} {unitLabel}</div>
                              )}
                              {timeVal && (
                                <div className="text-xs text-[#6b7280] font-mono">{timeVal}</div>
                              )}
                            </div>
                            {/* Session summary parts */}
                            <div className="flex-1 min-w-0 pt-0.5 space-y-0.5">
                              {parts.length > 0
                                ? parts.map((p, i) => (
                                    <div key={i} className={`text-xs ${p.color}`}>{p.text}</div>
                                  ))
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
