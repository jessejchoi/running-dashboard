'use client'
import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

export default function PatternInsightCard() {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [content, setContent] = useState<string | null>(null)

  async function fetchInsight(force = false) {
    setState('loading')
    try {
      const url = force ? '/api/coach/insight?force=true' : '/api/coach/insight'
      const res = await fetch(url)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setContent(data.content)
      setState('loaded')
    } catch {
      setState('error')
    }
  }

  useEffect(() => { fetchInsight() }, [])

  if (state === 'error') return null

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
          Pattern Insight
        </span>
        <button
          onClick={() => fetchInsight(true)}
          disabled={state === 'loading'}
          className="text-[#4b5563] hover:text-[#ff1d6c] transition-colors disabled:opacity-40"
          title="Refresh insight"
        >
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} />
        </button>
      </div>

      {state === 'loading' ? (
        <div className="space-y-2">
          {[90, 75, 55].map(w => (
            <div
              key={w}
              className="animate-pulse rounded"
              style={{ height: 14, background: 'var(--surface-2)', width: `${w}%` }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {content}
        </p>
      )}
    </div>
  )
}
