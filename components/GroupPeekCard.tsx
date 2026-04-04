'use client'
import { useState, useEffect } from 'react'

interface Props {
  groupId: string
}

interface PeekData {
  rank: number
  total: number
  week_km: number
  coach_line: string
}

export default function GroupPeekCard({ groupId }: Props) {
  const [data, setData] = useState<PeekData | null>(null)

  useEffect(() => {
    fetch(`/api/groups/${groupId}/peek`)
      .then(res => {
        if (!res.ok) return null
        return res.json()
      })
      .then(d => { if (d) setData(d) })
      .catch(() => {})
  }, [groupId])

  if (!data) return null

  const rankEmoji = data.rank === 1 ? '🥇' : data.rank === 2 ? '🥈' : data.rank === 3 ? '🥉' : null

  return (
    <div
      className="fade-up"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem',
      }}
    >
      <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
        Group Standing
      </p>
      <div className="flex items-baseline gap-2 mb-2">
        {rankEmoji && <span className="text-2xl leading-none">{rankEmoji}</span>}
        <span className="font-bold text-2xl text-white leading-none">#{data.rank}</span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>of {data.total}</span>
        <span className="font-mono font-bold text-sm ml-auto" style={{ color: 'var(--accent)' }}>
          {data.week_km.toFixed(1)} km
        </span>
      </div>
      <p className="text-xs leading-relaxed italic" style={{ color: 'var(--text-2)' }}>
        &ldquo;{data.coach_line}&rdquo;
      </p>
    </div>
  )
}
