'use client'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, ReferenceLine, Tooltip } from 'recharts'

interface Props {
  streams: { heartrate?: { data: number[] }; time?: { data: number[] } } | null
  avgHR?: number | null
  maxHR?: number | null
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const mins = Math.floor(d.time / 60)
  const secs = d.time % 60
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
      <div className="text-[#6b7280]">{mins}:{secs.toString().padStart(2,'0')}</div>
      <div className="font-mono font-bold text-red-400">{payload[0].value} bpm</div>
    </div>
  )
}

export default function HRChart({ streams, avgHR, maxHR }: Props) {
  if (!streams?.heartrate?.data?.length) return null

  const hrData = streams.heartrate.data
  const timeData = streams.time?.data ?? hrData.map((_, i) => i)

  // Downsample to max 300 points for performance
  const step = Math.max(1, Math.floor(hrData.length / 300))
  const data = hrData
    .filter((_, i) => i % step === 0)
    .map((hr, i) => ({ time: timeData[i * step], hr }))

  const allHR = data.map(d => d.hr)
  const minHR = Math.min(...allHR) - 5
  const maxHRVal = Math.max(...allHR) + 5

  // X axis tick formatter: convert seconds to mm:ss
  const tickFormatter = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m}m`
  }

  return (
    <div>
      {/* Avg / Max inline stats */}
      <div className="flex gap-6 mb-4 text-sm">
        {avgHR && (
          <div>
            <div className="text-[#6b7280] text-xs mb-0.5">Avg HR</div>
            <div className="font-mono font-bold text-white">{Math.round(avgHR)} <span className="text-[#6b7280] text-xs font-normal">bpm</span></div>
          </div>
        )}
        {maxHR && (
          <div>
            <div className="text-[#6b7280] text-xs mb-0.5">Max HR</div>
            <div className="font-mono font-bold text-red-400">{Math.round(maxHR)} <span className="text-[#6b7280] text-xs font-normal">bpm</span></div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#1a1a1a" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={tickFormatter}
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minHR, maxHRVal]}
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {avgHR && (
            <ReferenceLine y={avgHR} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.5} strokeWidth={1} />
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
    </div>
  )
}
