'use client'
import { categorizeLaps, type LapType } from '@/lib/lapUtils'

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

  // Bar height weighted by distance — taller bar = more km
  const distances = data.map(d => parseFloat(d.dist ?? '0') || 0)
  const maxDist = Math.max(...distances, 0.01)
  const barHeight = (dist: number) => Math.round(8 + (dist / maxDist) * 20)  // 8px–28px

  const lapTypes = colorMode === 'lap-type' ? categorizeLaps(splits, avgPace) : null
  const usedTypes = lapTypes ? [...new Set(lapTypes)] : []

  return (
    <div className="space-y-1.5">
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

      {/* Rows */}
      {data.map((d, i) => {
        const color = colorMode === 'lap-type' && lapTypes ? TYPE_COLOR[lapTypes[i]] : '#f97316'
        return (
          <div key={d.index} className="flex items-center gap-2">
            <div className="text-[#6b7280] text-xs font-mono w-5 shrink-0 text-right">
              {label === 'km' ? `${d.index}` : `L${d.index}`}
            </div>
            <div className="flex-1 flex items-center" style={{ height: barHeight(parseFloat(d.dist ?? '0') || 0) + 4 }}>
              <div className="rounded-sm" style={{ width: `${barWidth(d.pace)}%`, height: barHeight(parseFloat(d.dist ?? '0') || 0), backgroundColor: color, opacity: 0.8 }} />
            </div>
            <div className="text-xs font-mono font-bold text-white w-8 shrink-0 text-right">
              {paceLabel(d.pace)}
            </div>
            {showDistance && (
              <div className="text-xs font-mono text-[#9ca3af] w-10 sm:w-14 shrink-0 text-right">
                {d.dist ?? '—'}
              </div>
            )}
            <div className="text-xs font-mono text-[#6b7280] w-8 shrink-0 text-right">
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
