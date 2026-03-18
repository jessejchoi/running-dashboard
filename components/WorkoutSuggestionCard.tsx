'use client'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import RunTypeBadge from '@/components/RunTypeBadge'

interface WorkoutSuggestion {
  run_type: 'easy' | 'interval' | 'threshold' | 'long_easy' | 'recovery'
  distance_km: number
  pace_per_km: string
  structure: string
  rationale: string
}

type ApiResponse =
  | { type: 'no_goals'; message: string }
  | { type: 'rest'; message: string }
  | { workout: WorkoutSuggestion; generated_at: string; cached: boolean }

interface WorkoutSuggestionCardProps {
  athleteId: number
}

export default function WorkoutSuggestionCard({ athleteId }: WorkoutSuggestionCardProps) {
  const [state, setState] = useState<'loading' | 'no_goals' | 'rest' | 'loaded' | 'error'>('loading')
  const [data, setData] = useState<ApiResponse | null>(null)

  function fetchWorkout(force = false) {
    setState('loading')
    setData(null)
    const url = force ? '/api/coach/today?force=true' : '/api/coach/today'
    fetch(url)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to fetch')
        const json: ApiResponse = await res.json()
        setData(json)
        if ('type' in json) {
          setState(json.type as 'no_goals' | 'rest')
        } else {
          setState('loaded')
        }
      })
      .catch(() => {
        setState('error')
      })
  }

  useEffect(() => {
    fetchWorkout()
  }, [])

  return (
    <div
      className="card fade-up"
      style={{ padding: '1.25rem' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Today&apos;s Session
          </p>
          <span
            className="font-mono uppercase tracking-widest"
            style={{
              fontSize: 9,
              color: 'var(--accent)',
              background: 'var(--accent-muted)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            RDCoach
          </span>
        </div>
        {state !== 'loading' && (
          <button
            onClick={() => fetchWorkout(true)}
            className="flex items-center gap-1 text-xs transition-colors"
            style={{ color: 'var(--text-3)' }}
            title="Refresh suggestion"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {state === 'loading' && (
        <div className="space-y-3">
          <div className="animate-pulse rounded" style={{ height: 20, background: 'var(--surface-2)', width: '40%' }} />
          <div className="animate-pulse rounded" style={{ height: 14, background: 'var(--surface-2)', width: '80%' }} />
          <div className="animate-pulse rounded" style={{ height: 14, background: 'var(--surface-2)', width: '60%' }} />
        </div>
      )}

      {/* No goals */}
      {state === 'no_goals' && data && 'message' in data && (
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{data.message}</p>
      )}

      {/* Rest day */}
      {state === 'rest' && data && 'message' in data && (
        <div>
          <p className="font-mono text-base font-bold mb-1" style={{ color: 'var(--text-1)' }}>Rest Day</p>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>{data.message}</p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          Could not load suggestion.{' '}
          <button
            onClick={() => fetchWorkout()}
            className="underline transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            Retry
          </button>
        </p>
      )}

      {/* Loaded workout */}
      {state === 'loaded' && data && 'workout' in data && (
        <div className="space-y-3">
          {/* Run type + primary metrics */}
          <div className="flex items-center gap-3 flex-wrap">
            <RunTypeBadge type={data.workout.run_type} />
            <span className="font-mono font-bold text-white" style={{ fontSize: 15 }}>
              {data.workout.distance_km} km
            </span>
            <span className="font-mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>
              @ {data.workout.pace_per_km}/km
            </span>
          </div>

          {/* Structure */}
          <p
            className="font-mono text-sm"
            style={{
              color: 'var(--text-2)',
              background: 'var(--surface-2)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 12,
            }}
          >
            {data.workout.structure}
          </p>

          {/* Rationale */}
          <p className="text-xs italic" style={{ color: 'var(--text-3)' }}>
            {data.workout.rationale}
          </p>
        </div>
      )}
    </div>
  )
}
