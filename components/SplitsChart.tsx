'use client'
import { categorizeLaps, type LapType } from '@/lib/lapUtils'

interface SplitData {
  average_speed?: number
  average_heartrate?: number
  distance?: number
  moving_time?: number
  elapsed_time?: number
  [key: string]: any
}

interface Props {
  splits: SplitData[]
  avgPace: number
  label?: 'km' | 'lap'
  showDistance?: boolean
  colorMode?: 'uniform' | 'lap-type'
  runType?: string | null
  // For proportional laps: total chart row count (= km splits count) to match card height
  kmSplitCount?: number
}

const TYPE_COLOR: Record<LapType, string> = {
  warmup:   '#facc15',  // yellow
  interval: '#f87171',  // red
  recovery: '#60a5fa',  // blue
  cooldown: '#a78bfa',  // purple
  steady:   '#f97316',  // orange
}

function paceStr(s: number) {
  if (!s || s > 900) return '—'
  let m = Math.floor(s / 60)
  let sec = Math.round(s % 60)
  if (sec === 60) { m += 1; sec = 0 }
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function SplitsChart({
  splits, avgPace, label = 'km', showDistance = false,
  colorMode = 'uniform', runType, kmSplitCount
}: Props) {
  const data = splits.map((s, i) => ({
    index: i + 1,
    pace: s.average_speed ? parseFloat((1000 / s.average_speed).toFixed(1)) : 0,
    hr: s.average_heartrate ? Math.round(s.average_heartrate) : null,
    distKm: s.distance ? s.distance / 1000 : 0,
  })).filter(d => d.pace > 0 && d.pace < 900)

  if (data.length === 0) return null

  const lapTypes = colorMode === 'lap-type' ? categorizeLaps(splits, avgPace, runType) : null
  const usedTypes = lapTypes ? [...new Set(lapTypes)] : []

  // ── KM SPLITS: pace-based bar width, uniform height ────────────────────────
  if (label === 'km') {
    const paces = data.map(d => d.pace)
    const maxP = Math.max(...paces)
    const range = maxP - Math.min(...paces) || 1
    const barWidth = (pace: number) => Math.round(20 + ((maxP - pace) / range) * 75)
    const ROW_H = 22  // px per row

    return (
      <div className="space-y-1.5">
        {/* Headers */}
        <div className="flex items-center gap-2 pb-1 border-b border-[#1c1c1c]">
          <div className="w-5 shrink-0" />
          <div className="flex-1" />
          <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">Pace</div>
          <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">HR</div>
        </div>
        {data.map((d, i) => (
          <div key={d.index} className="flex items-center gap-2">
            <div className="text-[#6b7280] text-xs font-mono w-5 shrink-0 text-right">
              {i === data.length - 1 && d.distKm < 0.95
                ? `0.${Math.round(d.distKm * 10)}`
                : `${d.index}`}
            </div>
            <div className="flex-1 flex items-center" style={{ height: ROW_H }}>
              <div className="rounded-sm" style={{ width: `${barWidth(d.pace)}%`, height: 16, backgroundColor: '#f97316', opacity: 0.8 }} />
            </div>
            <div className="text-xs font-mono font-bold text-white w-8 shrink-0 text-right">{paceStr(d.pace)}</div>
            <div className="text-xs font-mono text-[#6b7280] w-8 shrink-0 text-right">{d.hr ?? '—'}</div>
          </div>
        ))}
      </div>
    )
  }

  // ── LAP CHART: proportional heights, always show numbers ─────────────────────
  const totalDist = data.reduce((s, d) => s + d.distKm, 0) || 1
  const MIN_ROW = 20  // px — minimum height so numbers always fit

  // Target total height matches km splits card (each km row ≈ 25px)
  const targetTotalH = Math.max(kmSplitCount ? kmSplitCount * 25 : 200, data.length * MIN_ROW)

  // Proportional heights, but bump any below MIN_ROW up, then scale others to compensate
  const rawHeights = data.map(d => (d.distKm / totalDist) * targetTotalH)
  const clamped = rawHeights.map(h => Math.max(h, MIN_ROW))
  // If clamping added height, scale down the tall bars proportionally
  const clampedTotal = clamped.reduce((s, h) => s + h, 0)
  const scaleFactor = clampedTotal > 0 ? targetTotalH / clampedTotal : 1
  const lapHeights = clamped.map(h => h < MIN_ROW + 0.5 ? h : h * scaleFactor)
  const totalH = lapHeights.reduce((s, h) => s + h, 0)

  return (
    <div>
      {/* Proportional stacked bars — numbers always shown */}
      <div className="w-full" style={{ height: totalH }}>
        <div className="relative w-full h-full flex flex-col" style={{ gap: 2 }}>
          {data.map((d, i) => {
            const color = lapTypes ? TYPE_COLOR[lapTypes[i]] : '#f97316'
            const barH = lapHeights[i]
            // Font scales with bar height — min 8px, max 11px
            const fs = Math.max(8, Math.min(11, Math.floor(barH / 2.2)))
            const lapLabel = `L${d.index}`

            return (
              <div key={d.index} className="flex items-center gap-2" style={{ height: barH }}>
                {/* Lap label — always shown */}
                <div className="text-[#6b7280] font-mono shrink-0 text-right w-5" style={{ fontSize: fs }}>
                  {lapLabel}
                </div>
                {/* Bar — full width of container */}
                <div className="flex-1 relative flex items-center" style={{ height: barH }}>
                  <div
                    className="rounded-sm w-full"
                    style={{ height: Math.max(4, barH - 4), backgroundColor: color, opacity: 0.82 }}
                  />
                  {/* Inline pace label overlaid on bar (only when bar is tall enough) */}
                  {barH >= 24 && (
                    <div className="absolute inset-0 flex items-center px-2 gap-2">
                      <span className="text-white/70 font-mono font-bold" style={{ fontSize: 10 }}>{paceStr(d.pace)}</span>
                      {d.hr && <span className="text-white/50 font-mono" style={{ fontSize: 10 }}>{d.hr}</span>}
                    </div>
                  )}
                </div>
                {/* Pace column — always shown */}
                <div className="font-mono font-bold text-white shrink-0 text-right w-8" style={{ fontSize: fs }}>
                  {paceStr(d.pace)}
                </div>
                {showDistance && (
                  <div className="font-mono text-[#9ca3af] shrink-0 text-right w-8" style={{ fontSize: fs }}>
                    {d.distKm.toFixed(2)}
                  </div>
                )}
                {/* HR column — always shown */}
                <div className="font-mono text-[#6b7280] shrink-0 text-right w-8" style={{ fontSize: fs }}>
                  {d.hr ?? '—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      {colorMode === 'lap-type' && usedTypes.length > 1 && (
        <div className="flex flex-wrap gap-3 pt-3">
          {usedTypes.map(t => (
            <span key={t} className="flex items-center gap-1.5 text-[10px] text-[#6b7280]">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: TYPE_COLOR[t] }} />
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
