'use client'
import { useEffect, useState } from 'react'

interface CoachNoteCardProps {
  runId: number
  athleteId: number
}

interface CoachNoteData {
  content: string
  generated_at: string
}

export default function CoachNoteCard({ runId, athleteId }: CoachNoteCardProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [note, setNote] = useState<CoachNoteData | null>(null)

  useEffect(() => {
    fetch(`/api/runs/${runId}/coach-note`)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to fetch')
        const data: CoachNoteData = await res.json()
        setNote(data)
        setState('loaded')
      })
      .catch(() => {
        setState('error')
      })
  }, [runId])

  if (state === 'error' || (state === 'loaded' && !note)) return null

  return (
    <div
      className="fade-up"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid rgba(249,115,22,0.20)',
        borderRadius: 12,
        padding: '1rem',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="font-mono uppercase tracking-widest"
          style={{
            fontSize: 10,
            color: 'var(--accent)',
            background: 'var(--accent-muted)',
            borderRadius: 4,
            padding: '2px 6px',
          }}
        >
          RDCoach
        </span>
      </div>

      {/* Body */}
      {state === 'loading' ? (
        <div className="space-y-2">
          <div
            className="animate-pulse rounded"
            style={{ height: 14, background: 'var(--surface-2)', width: '90%' }}
          />
          <div
            className="animate-pulse rounded"
            style={{ height: 14, background: 'var(--surface-2)', width: '75%' }}
          />
          <div
            className="animate-pulse rounded"
            style={{ height: 14, background: 'var(--surface-2)', width: '60%' }}
          />
        </div>
      ) : (
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--text-2)' }}
        >
          {note?.content}
        </p>
      )}
    </div>
  )
}
