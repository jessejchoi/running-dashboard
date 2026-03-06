'use client'

interface Split {
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  [key: string]: any
}

interface Props {
  splits: Split[]
  avgPace: number
  label?: string
  showDistance?: boolean
  colorMode?: 'uniform' | 'lap-type'
}

export type LapType = 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'steady'

export interface LapSegment {
  startSec: number
  endSec: number
  type: LapType
}

export function categorizeLaps(splits: Split[], avgPace: number): LapType[] {
  const paces = splits.map(s => s.average_speed ? 1000 / s.average_speed : 999)
  const n = paces.length
  const isFast = (p: number) => p < avgPace * 0.88
  const isSlow = (p: number) => p > avgPace * 1.15

  const raw: LapType[] = paces.map(p =>
    isFast(p) ? 'interval' : isSlow(p) ? 'recovery' : 'steady'
  )

  let firstFastIdx = raw.findIndex(t => t === 'interval')
  let lastFastIdx = n - 1 - [...raw].reverse().findIndex(t => t === 'interval')
  if (firstFastIdx === -1) { firstFastIdx = n; lastFastIdx = -1 }

  return raw.map((t, i) => {
    if (t !== 'recovery' && t !== 'steady') return t
    if (i < firstFastIdx) return 'warmup'
    if (i > lastFastIdx) return 'cooldown'
    return t
  })
}

export function buildLapSegments(splits: Split[], avgPace: number): LapSegment[] {
  const types = categorizeLaps(splits, avgPace)
  let cursor = 0
  return splits.map((s, i) => {
    const dur = s.moving_time ?? s.elapsed_time ?? 60
    const seg: LapSegment = { startSec: cursor, endSec: cursor + dur, type: types[i] }
    cursor += dur
    return seg
  })
}

const TYPE_COLOR: Record<LapType, string> = {
  warmup:   '#facc15',  // yellow
  interval: '#f87171',  // red
  recovery: '#60a5fa',  // blue
  cooldown: '#a78bfa',  // purple
  steady:   '#f97316',  // orange
}

function paceLabel(s: number) {
  if (!s || s > 900) return '—'
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
}

export default function SplitsChart({ splits, avgPace, label = 'km', showDistance = false, colorMode = 'uniform' }: Props) {
  const data = splits.map((s, i) => ({
    index: i + 1,
    pace: s.average_speed ? parseFloat((1000 / s.average_speed).toFixed(1)) : 0,
    hr: s.average_heartrate ? Math.round(s.average_heartrate) : null,
    dist: s.distance ? (s.distance / 1000).toFixed(2) : null,
  })).filter(d => d.pace > 0 && d.pace < 900)

  if (data.length === 0) return null

  const paces = data.map(d => d.pace)
  const maxP = Math.max(...paces)
  const range = maxP - Math.min(...paces) || 1
  const barWidth = (pace: number) => Math.round(20 + ((maxP - pace) / range) * 75)
  const lapTypes = colorMode === 'lap-type' ? categorizeLaps(splits, avgPace) : null
  const usedTypes = lapTypes ? [...new Set(lapTypes)] : []

  return (
    <div className="space-y-1.5">
      {/* Column headers */}
      <div className="flex items-center gap-2 pb-1 border-b border-[#1c1c1c]">
        <div className="w-8 shrink-0" />
        <div className="flex-1" />
        <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-14 shrink-0 text-right">Pace</div>
        {showDistance && (
          <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-14 shrink-0 text-right">Dist</div>
        )}
        <div className="text-[10px] font-medium text-[#4b5563] uppercase tracking-wider w-16 shrink-0 text-right">Avg HR</div>
      </div>

      {/* Rows */}
      {data.map((d, i) => {
        const color = colorMode === 'lap-type' && lapTypes ? TYPE_COLOR[lapTypes[i]] : '#f97316'
        return (
          <div key={d.index} className="flex items-center gap-2">
            <div className="text-[#6b7280] text-xs font-mono w-8 shrink-0 text-right">
              {label === 'km' ? `${d.index}` : `L${d.index}`}
            </div>
            <div className="flex-1 h-5 flex items-center">
              <div className="h-4 rounded-sm" style={{ width: `${barWidth(d.pace)}%`, backgroundColor: color, opacity: 0.8 }} />
            </div>
            <div className="text-xs font-mono font-bold text-white w-14 shrink-0 text-right">
              {paceLabel(d.pace)}
            </div>
            {showDistance && (
              <div className="text-xs font-mono text-[#9ca3af] w-14 shrink-0 text-right">
                {d.dist ?? '—'}
              </div>
            )}
            <div className="text-xs font-mono text-[#6b7280] w-16 shrink-0 text-right">
              {d.hr ?? '—'}
            </div>
          </div>
        )
      })}

      {/* Legend */}
      {colorMode === 'lap-type' && usedTypes.length > 1 && (
        <div className="flex flex-wrap gap-3 pt-2">
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
