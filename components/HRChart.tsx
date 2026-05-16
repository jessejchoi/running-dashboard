'use client'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Customized } from 'recharts'
import type { LapSegment } from '@/lib/lapUtils'

interface StreamData {
  heartrate?: { data: number[] }
  time?: { data: number[] }
}

interface Props {
  streams: StreamData | null
  avgHR?: number | null
  maxHR?: number | null
  lapSegments?: LapSegment[]
}

const SEGMENT_COLOR: Record<string, string> = {
  warmup:   'rgba(161,161,170,0.12)',
  cooldown: 'rgba(107,114,128,0.12)',
  recovery: 'rgba(59,130,246,0.14)',
  easy:     'rgba(34,197,94,0.12)',
  steady:   'rgba(34,197,94,0.10)',
  tempo:    'rgba(234,179,8,0.14)',
  threshold:'rgba(245,158,11,0.16)',
  interval: 'rgba(249,115,22,0.16)',
  stride:   'rgba(239,68,68,0.16)',
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const mins = Math.floor(d.time / 60)
  const secs = (d.time % 60).toString().padStart(2, '0')
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
      <div className="text-[#6b7280]">{mins}:{secs}</div>
      <div className="font-mono font-bold text-red-400">{payload[0].value} bpm</div>
    </div>
  )
}

// Recharts Customized component — receives actual chart pixel layout
function SegmentBands({ segments, totalDuration, chartX, chartY, chartWidth, chartHeight }: any) {
  if (!segments?.length || !totalDuration || !chartWidth) return null
  return (
    <g>
      {segments.map((seg: LapSegment, i: number) => {
        const color = SEGMENT_COLOR[seg.type]
        if (!color || color === 'transparent') return null
        const xStart = chartX + (seg.startSec / totalDuration) * chartWidth
        const w = ((seg.endSec - seg.startSec) / totalDuration) * chartWidth
        return (
          <rect
            key={i}
            x={xStart}
            y={chartY}
            width={Math.max(w, 0)}
            height={chartHeight}
            fill={color}
          />
        )
      })}
    </g>
  )
}

export default function HRChart({ streams, avgHR, maxHR, lapSegments }: Props) {
  const hrData = streams?.heartrate?.data ?? []
  const timeData = streams?.time?.data ?? hrData.map((_, i) => i)
  const hasStream = hrData.length > 0

  const step = Math.max(1, Math.floor(hrData.length / 300))
  const data = hrData
    .filter((_, i) => i % step === 0)
    .map((hr, i) => ({ time: timeData[i * step], hr }))

  const allHR = data.map(d => d.hr)
  const minHR = allHR.length ? Math.min(...allHR) - 5 : 100
  const maxHRVal = allHR.length ? Math.max(...allHR) + 5 : 200
  const totalDuration = timeData.length > 0 ? timeData[timeData.length - 1] : 1

  // Extend last segment to fill the full stream — moving_time vs elapsed_time can leave a gap
  const extendedSegments = lapSegments && lapSegments.length > 0
    ? lapSegments.map((seg, i) =>
        i === lapSegments.length - 1 && seg.endSec < totalDuration
          ? { ...seg, endSec: totalDuration }
          : seg
      )
    : lapSegments

  return (
    <div>
      <div className="flex gap-6 mb-4">
        {avgHR && (
          <div>
            <div className="text-[#6b7280] text-xs mb-0.5">Avg HR</div>
            <div className="font-mono font-bold text-white text-lg">
              {Math.round(avgHR)} <span className="text-[#6b7280] text-xs font-normal">bpm</span>
            </div>
          </div>
        )}
        {maxHR && (
          <div>
            <div className="text-[#6b7280] text-xs mb-0.5">Max HR</div>
            <div className="font-mono font-bold text-red-400 text-lg">
              {Math.round(maxHR)} <span className="text-[#6b7280] text-xs font-normal">bpm</span>
            </div>
          </div>
        )}
      </div>

      {hasStream ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="time"
              tickFormatter={(s) => `${Math.floor(s / 60)}m`}
              tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minHR, maxHRVal]}
              tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Segment bands drawn first so line appears on top */}
            <Customized
              component={(props: any) => {
                const o = props.offset ?? {}
                return (
                  <SegmentBands
                    segments={extendedSegments}
                    totalDuration={totalDuration}
                    chartX={o.left ?? 0}
                    chartY={o.top ?? 0}
                    chartWidth={o.width ?? 0}
                    chartHeight={o.height ?? 0}
                  />
                )
              }}
            />
            {avgHR && (
              <ReferenceLine y={avgHR} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.4} strokeWidth={1} />
            )}
            <Line
              type="monotone"
              dataKey="hr"
              stroke="#f87171"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#f87171' }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-[#4b5563] text-xs text-center py-4">
          HR stream will appear after the next sync.
        </div>
      )}
    </div>
  )
}
