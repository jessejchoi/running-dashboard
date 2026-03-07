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
  kmSplitCount?: number
}

const TYPE_COLOR: Record<LapType, string> = {
  warmup:   '#facc15',  // yellow
  interval: '#dc2626',  // dark red
  recovery: '#60a5fa',  // blue
  cooldown: '#a78bfa',  // purple
  steady:   '#f97316',  // orange
}

const TYPE_LABEL: Record<LapType, string> = {
  warmup: 'warmup', interval: 'interval', recovery: 'recovery',
  cooldown: 'cooldown', steady: 'steady',
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

  // Single-lap: render like a km split with a fixed 50% bar
  if (label === 'lap' && data.length === 1) {
    const d = data[0]
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 pb-1 border-b border-[#1c1c1c]">
          <div className="w-5 shrink-0" />
          <div className="flex-1" />
          <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">Pace</div>
          {showDistance && <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">Dist</div>}
          <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">HR</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[#6b7280] text-xs font-mono w-5 shrink-0 text-right">L1</div>
          <div className="flex-1 flex items-center overflow-hidden" style={{ height: 22 }}>
            <div className="rounded-sm" style={{ width: '50%', height: 16, backgroundColor: '#f97316', opacity: 0.8 }} />
          </div>
          <div className="text-xs font-mono font-bold text-white w-8 shrink-0 text-right">{paceStr(d.pace)}</div>
          {showDistance && <div className="text-xs font-mono text-[#9ca3af] w-8 shrink-0 text-right">{d.distKm.toFixed(2)}</div>}
          <div className="text-xs font-mono text-[#6b7280] w-8 shrink-0 text-right">{d.hr ?? '—'}</div>
        </div>
      </div>
    )
  }

  const lapTypes = colorMode === 'lap-type' ? categorizeLaps(splits, avgPace, runType) : null
  const usedTypes = lapTypes ? ([...new Set(lapTypes)] as LapType[]) : []

  // Shared: pace → bar width (faster = wider, same as km splits)
  const paces = data.map(d => d.pace)
  const maxP = Math.max(...paces)
  const minP = Math.min(...paces)
  const paceRange = maxP - minP || 1
  const barWidth = (pace: number) => Math.min(95, Math.round(20 + ((maxP - pace) / paceRange) * 75))

  // ── KM SPLITS ──────────────────────────────────────────────────────────────
  if (label === 'km') {
    return (
      <div className="space-y-1.5">
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
            <div className="flex-1 flex items-center" style={{ height: 22 }}>
              <div className="rounded-sm" style={{ width: `${barWidth(d.pace)}%`, height: 16, backgroundColor: '#f97316', opacity: 0.8 }} />
            </div>
            <div className="text-xs font-mono font-bold text-white w-8 shrink-0 text-right">{paceStr(d.pace)}</div>
            <div className="text-xs font-mono text-[#6b7280] w-8 shrink-0 text-right">{d.hr ?? '—'}</div>
          </div>
        ))}
      </div>
    )
  }

  // ── LAP CHART ──────────────────────────────────────────────────────────────
  // Height = proportional to distance. Width = pace (faster = longer bar).
  const totalDist = data.reduce((s, d) => s + d.distKm, 0) || 1
  const MIN_ROW = 10  // px min — smaller bars allowed

  const targetTotalH = Math.max(kmSplitCount ? kmSplitCount * 25 : 200, data.length * MIN_ROW)
  const rawH = data.map(d => (d.distKm / totalDist) * targetTotalH)
  const clamped = rawH.map(h => Math.max(h, MIN_ROW))
  const clampedSum = clamped.reduce((s, h) => s + h, 0)
  const scale = targetTotalH / clampedSum
  const lapHeights = clamped.map(h => h <= MIN_ROW + 0.5 ? h : h * scale)
  const totalH = lapHeights.reduce((s, h) => s + h, 0)

  return (
    <div className="space-y-3">
      {/* Column headers */}
      <div className="flex items-center gap-2 pb-1 border-b border-[#1c1c1c]">
        <div className="w-5 shrink-0" />
        <div className="flex-1" />
        <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">Pace</div>
        {showDistance && (
          <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">Dist</div>
        )}
        <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-8 shrink-0 text-right">HR</div>
      </div>

      {/* Bars */}
      <div>
        <div className="flex flex-col" style={{ gap: 2 }}>
          {data.map((d, i) => {
            const color = lapTypes ? TYPE_COLOR[lapTypes[i]] : '#f97316'
            const barH = lapHeights[i]
            const fs = Math.max(8, Math.min(11, Math.floor(barH / 2.2)))

            return (
              <div key={d.index} className="flex items-center gap-2" style={{ height: barH }}>
                {/* Label */}
                <div className="text-[#6b7280] font-mono shrink-0 text-right w-5" style={{ fontSize: fs }}>
                  L{d.index}
                </div>
                {/* Bar — width = pace, height = distance */}
                <div className="flex-1 flex items-center overflow-hidden" style={{ height: barH }}>
                  <div
                    className="rounded-sm"
                    style={{
                      width: `${barWidth(d.pace)}%`,
                      height: Math.max(4, barH - 4),
                      backgroundColor: color,
                      opacity: 0.85,
                    }}
                  />
                </div>
                {/* Pace */}
                <div className="font-mono font-bold text-white shrink-0 text-right w-8" style={{ fontSize: fs }}>
                  {paceStr(d.pace)}
                </div>
                {/* Dist */}
                {showDistance && (
                  <div className="font-mono text-[#9ca3af] shrink-0 text-right w-8" style={{ fontSize: fs }}>
                    {d.distKm.toFixed(2)}
                  </div>
                )}
                {/* HR */}
                <div className="font-mono text-[#6b7280] shrink-0 text-right w-8" style={{ fontSize: fs }}>
                  {d.hr ?? '—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend — always below chart with solid background */}
      {colorMode === 'lap-type' && usedTypes.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 mt-1 border-t border-[#2a2a2a]">
          {usedTypes.map(t => (
            <span key={t} className="flex items-center gap-1.5 text-[11px] font-medium text-[#9ca3af]">
              <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ backgroundColor: TYPE_COLOR[t] }} />
              {TYPE_LABEL[t]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
