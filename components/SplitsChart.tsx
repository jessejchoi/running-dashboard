'use client'

interface Split {
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
}

interface Props {
  splits: Split[]
  avgPace: number
  label?: string
}

function paceLabel(s: number) {
  if (!s || s > 900) return '—'
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
}

export default function SplitsChart({ splits, avgPace, label = 'km' }: Props) {
  const data = splits.map((s, i) => ({
    index: i + 1,
    pace: s.average_speed ? parseFloat((1000 / s.average_speed).toFixed(1)) : 0,
    time: s.moving_time ?? 0,
    hr: s.average_heartrate ? Math.round(s.average_heartrate) : null,
  })).filter(d => d.pace > 0 && d.pace < 900)

  if (data.length === 0) return null

  const paces = data.map(d => d.pace)
  const minP = Math.min(...paces)
  const maxP = Math.max(...paces)
  const range = maxP - minP || 1

  const barWidth = (pace: number) =>
    Math.round(20 + ((maxP - pace) / range) * 75)

  return (
    <div className="space-y-1.5">
      {data.map((d) => {
        const fast = d.pace <= avgPace * 0.98
        const slow = d.pace >= avgPace * 1.02
        const color = fast ? '#34d399' : slow ? '#f87171' : '#f97316'
        return (
          <div key={d.index} className="flex items-center gap-2">
            <div className="text-[#6b7280] text-xs font-mono w-8 shrink-0 text-right">
              {label === 'km' ? `${d.index}` : `L${d.index}`}
            </div>
            <div className="flex-1 h-6 flex items-center">
              <div className="h-5 rounded-sm" style={{ width: `${barWidth(d.pace)}%`, backgroundColor: color, opacity: 0.85 }} />
            </div>
            <div className="text-xs font-mono font-bold text-white w-14 shrink-0">{paceLabel(d.pace)}/km</div>
            <div className="text-xs font-mono text-[#6b7280] w-14 shrink-0">{d.hr ? `${d.hr} bpm` : '—'}</div>
          </div>
        )
      })}
      <div className="flex items-center gap-4 pt-2 text-[10px] text-[#4b5563]">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />faster</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#f97316] inline-block" />on pace</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />slower</span>
      </div>
    </div>
  )
}
