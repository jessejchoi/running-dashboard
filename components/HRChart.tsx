'use client'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, ReferenceLine, Tooltip, ReferenceArea } from 'recharts'
import type { LapSegment } from './SplitsChart'

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
  warmup:   '#facc1520',
  interval: '#f9731620',
  recovery: '#60a5fa20',
  cooldown: '#a78bfa20',
  steady:   'transparent',
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

  return (
    <div>
      {/* Stats */}
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
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#1a1a1a" vertical={false} />
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

            {/* Lap segment background bands */}
            {lapSegments?.map((seg, i) => {
              const col = SEGMENT_COLOR[seg.type]
              if (!col || col === 'transparent') return null
              return (
                <ReferenceArea
                  key={i}
                  x1={seg.startSec}
                  x2={seg.endSec}
                  fill={col}
                  fillOpacity={1}
                  strokeOpacity={0}
                />
              )
            })}

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
