'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import RunTypeSelector from '@/components/RunTypeSelector'
import { speedToPace, formatDuration, formatDistance, paceUnitLabel, toJakartaDate, type DistanceUnit } from '@/lib/utils'
import { type RunType } from '@/lib/runtypes'

interface Activity {
  id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  suffer_score?: number
  total_elevation_gain?: number
  run_type: string | null
  run_type_manual: boolean
}

interface Props {
  runs: Activity[]
  unit: DistanceUnit
}

export default function RecentRunsCard({ runs, unit }: Props) {
  const [runTypes, setRunTypes] = useState<Record<number, string | null>>(
    Object.fromEntries(runs.map(r => [r.id, r.run_type]))
  )
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  if (runs.length === 0) return null

  function MetricCell({ label, value, tone = 'var(--fg-1)' }: { label: string; value: string; tone?: string }) {
    return (
      <div className="min-w-0 border border-[rgba(255,255,255,0.10)] bg-[#1A1A1A] px-2 py-2">
        <span className="block font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: 'var(--fg-4)' }}>
          / {label}
        </span>
        <span className="mt-1 block truncate font-mono text-[11px] font-bold tabular-nums" style={{ color: tone }}>
          {value}
        </span>
      </div>
    )
  }

  return (
    <section className="mt-8 mb-[14px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-[28px] text-[#F4F4F4] uppercase leading-none">Recent Runs</h2>
        <Link href="/runs" prefetch={true} className="pulse-link">
          View all
        </Link>
      </div>
      <div className="card pulse-bar fade-up p-[18px] sm:p-6">
        <span className="pulse-idx">[09]</span>

        <div className="flex flex-col">
          {runs.map((run, i) => {
            const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
            const isFast = paceSeconds <= 270
            const isTreadmill = runTypes[run.id] === 'treadmill'
            const isLast = i === runs.length - 1
            const pace = `${speedToPace(run.average_speed, unit)}${paceUnitLabel(unit)}`
            const duration = formatDuration(run.moving_time)
            const heartRate = run.average_heartrate ? `${Math.round(run.average_heartrate)} bpm` : '--'

            return (
            <div
              key={run.id}
              className="transition-colors duration-100"
              style={{
                background: hoveredId === run.id ? 'var(--ink-2)' : 'transparent',
                borderBottom: isLast ? 'none' : '1px solid var(--hair-1)',
                borderLeft: hoveredId === run.id ? '3px solid var(--magenta)' : '3px solid transparent',
                opacity: isTreadmill ? 0.5 : 1,
                margin: '0 -14px',
                padding: '14px',
              }}
              onMouseEnter={() => setHoveredId(run.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Mobile: stacked telemetry row for narrow screens */}
              <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] gap-x-3 gap-y-3 sm:hidden">
                <Link
                  href={`/runs/${run.id}`}
                  className="font-mono text-xs transition-colors hover:text-white"
                  style={{ color: 'var(--fg-4)' }}
                >
                  [{String(i + 1).padStart(2, '0')}]
                </Link>

                <Link
                  href={`/runs/${run.id}`}
                  className="min-w-0 font-display text-[17px] font-bold uppercase leading-[1.05] text-white transition-colors hover:text-[var(--magenta)]"
                >
                  <span className="block truncate">{run.name}</span>
                  <span className="mt-1 block font-mono text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--fg-3)' }}>
                    {format(toJakartaDate(run.start_date), 'MMM d')}
                  </span>
                </Link>

                <span className="justify-self-end font-mono text-sm font-bold tabular-nums" style={{ color: 'var(--magenta)' }}>
                  {formatDistance(run.distance, unit)}
                </span>

                <div className="col-span-3 flex min-w-0 items-center justify-between gap-3" onClick={e => e.stopPropagation()}>
                  <RunTypeSelector
                    activityId={run.id}
                    current={runTypes[run.id]}
                    isManual={run.run_type_manual}
                    compact
                    onUpdate={(t: RunType | null) => setRunTypes(prev => ({ ...prev, [run.id]: t }))}
                  />
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: isFast ? 'var(--acid)' : 'var(--fg-3)' }}>
                    {isFast ? 'Fast' : 'Logged'}
                  </span>
                </div>

                <div className="col-span-3 grid grid-cols-3 gap-1.5">
                  <MetricCell label="Pace" value={pace} tone={isFast ? 'var(--acid)' : 'var(--fg-1)'} />
                  <MetricCell label="Time" value={duration} tone="var(--fg-2)" />
                  <MetricCell label="HR" value={heartRate} tone={run.average_heartrate ? 'var(--fg-2)' : 'var(--fg-4)'} />
                </div>
              </div>

              {/* Desktop: compact table-like telemetry row */}
              <div className="hidden items-center gap-3 min-w-0 sm:flex">

                {/* Date — links to detail */}
                <Link
                  href={`/runs/${run.id}`}
                  className="font-mono text-xs shrink-0 hover:text-white transition-colors w-10"
                  style={{ color: 'var(--fg-4)' }}
                >
                  [{String(i + 1).padStart(2, '0')}]
                </Link>

                {/* Type selector */}
                <div className="shrink-0" onClick={e => e.stopPropagation()}>
                  <RunTypeSelector
                    activityId={run.id}
                    current={runTypes[run.id]}
                    isManual={run.run_type_manual}
                    onUpdate={(t: RunType | null) => setRunTypes(prev => ({ ...prev, [run.id]: t }))}
                  />
                </div>

                {/* Run name */}
                <Link
                  href={`/runs/${run.id}`}
                  className="font-display text-[16px] font-bold uppercase text-white truncate flex-1 min-w-0 hover:text-[var(--magenta)] transition-colors"
                >
                  {run.name}
                  <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--fg-3)' }}>
                    {format(toJakartaDate(run.start_date), 'MMM d')}
                  </span>
                </Link>

                {/* Stats — right aligned */}
                <div className="flex items-center gap-4 shrink-0 ml-auto">
                  {/* Distance */}
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--magenta)' }}>
                    {formatDistance(run.distance, unit)}
                  </span>

                  {/* Pace */}
                  <span
                    className="font-mono text-xs font-bold hidden sm:block"
                    style={{ color: isFast ? 'var(--acid)' : 'var(--fg-2)' }}
                  >
                    {pace}
                  </span>

                  {/* Duration */}
                  <span className="font-mono text-xs hidden md:block" style={{ color: 'var(--fg-2)' }}>
                    {duration}
                  </span>

                  {/* HR */}
                  {run.average_heartrate ? (
                    <span className="font-mono text-xs hidden lg:block" style={{ color: 'var(--fg-3)' }}>
                      {Math.round(run.average_heartrate)} bpm
                    </span>
                  ) : (
                    <span className="font-mono text-xs hidden lg:block" style={{ color: 'var(--fg-4)' }}>--</span>
                  )}
                </div>
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
