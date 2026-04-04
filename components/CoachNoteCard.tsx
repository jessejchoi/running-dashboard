'use client'
import { useEffect, useState } from 'react'

interface Props {
  runId: number
  athleteId: number
}

interface CoachNoteData {
  content: string
  generated_at: string
  perceived_effort: string | null
  athlete_note: string | null
}

const EFFORT_OPTIONS = ['Easy', 'Moderate', 'Hard', 'Max']

export default function CoachNoteCard({ runId, athleteId }: Props) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [note, setNote] = useState<CoachNoteData | null>(null)

  // Debrief form state
  const [showDebrief, setShowDebrief] = useState(false)
  const [effort, setEffort] = useState<string>('')
  const [athleteNote, setAthleteNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/runs/${runId}/coach-note`)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to fetch')
        const data: CoachNoteData = await res.json()
        setNote(data)
        setState('loaded')
        // Pre-populate debrief if already filled
        if (data.perceived_effort) setEffort(data.perceived_effort)
        if (data.athlete_note) setAthleteNote(data.athlete_note)
        if (data.perceived_effort || data.athlete_note) setSubmitted(true)
      })
      .catch(() => {
        setState('error')
      })
  }, [runId])

  async function submitDebrief() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/runs/${runId}/coach-note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perceivedEffort: effort || undefined,
          athleteNote: athleteNote.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('failed')
      const data: CoachNoteData = await res.json()
      setNote(data)
      setSubmitted(true)
      setShowDebrief(false)
    } catch {
      // silent — keep the form open
    } finally {
      setSubmitting(false)
    }
  }

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
      <div className="flex items-center justify-between mb-3">
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
        {state === 'loaded' && !showDebrief && (
          <button
            onClick={() => setShowDebrief(true)}
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: submitted ? 'var(--text-muted)' : 'var(--accent)' }}
          >
            {submitted ? 'Edit debrief' : 'Add debrief'}
          </button>
        )}
      </div>

      {/* Coach note */}
      {state === 'loading' ? (
        <div className="space-y-2">
          {[90, 75, 60].map(w => (
            <div
              key={w}
              className="animate-pulse rounded"
              style={{ height: 14, background: 'var(--surface-2)', width: `${w}%` }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-2)' }}>
          {note?.content}
        </p>
      )}

      {/* Submitted debrief summary */}
      {submitted && !showDebrief && (note?.perceived_effort || note?.athlete_note) && (
        <div
          className="rounded-lg px-3 py-2 mt-2"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          {note.perceived_effort && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Effort: <span className="text-white font-medium">{note.perceived_effort}</span>
            </p>
          )}
          {note.athlete_note && (
            <p className="text-xs mt-0.5 italic" style={{ color: 'var(--text-2)' }}>
              &ldquo;{note.athlete_note}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Debrief form */}
      {showDebrief && (
        <div
          className="rounded-lg px-3 py-3 mt-2 space-y-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>How did this feel?</p>
            <div className="flex gap-2 flex-wrap">
              {EFFORT_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setEffort(effort === opt ? '' : opt)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    background: effort === opt ? 'var(--accent)' : 'transparent',
                    borderColor: effort === opt ? 'var(--accent)' : 'var(--border)',
                    color: effort === opt ? '#000' : 'var(--text-2)',
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</p>
            <textarea
              value={athleteNote}
              onChange={e => setAthleteNote(e.target.value)}
              placeholder="Anything to add? Legs felt heavy, sleep was rough, nailed the intervals…"
              rows={2}
              maxLength={500}
              className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none"
              style={{
                background: 'var(--surface-0, #0f0f0f)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={submitDebrief}
              disabled={submitting || (!effort && !athleteNote.trim())}
              className="flex-1 py-2 text-xs font-bold rounded-lg transition-colors disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {submitting ? 'Asking coach…' : 'Ask coach to re-assess'}
            </button>
            <button
              onClick={() => setShowDebrief(false)}
              className="px-4 py-2 text-xs rounded-lg transition-colors"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
