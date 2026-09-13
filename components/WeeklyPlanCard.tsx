'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { localDate, addDays } from '@/lib/calendar'
import { type DistanceUnit, formatDistance } from '@/lib/utils'
export default function WeeklyPlanCard({ unit }: { unit: DistanceUnit }) {
  const [sessions, setSessions] = useState<any[] | null>(null),
    [error, setError] = useState(false)
  useEffect(() => {
    fetch('/api/plans')
      .then(async (r) => {
        if (!r.ok) throw 0
        const b = await r.json()
        const today = localDate(
          new Date(),
          b.preferences?.timezone ?? 'Asia/Jakarta',
        )
        setSessions(
          b.sessions.filter(
            (s: any) => s.plan_date >= today && s.plan_date < addDays(today, 7),
          ),
        )
      })
      .catch(() => setError(true))
  }, [])
  return (
    <section className="card my-6">
      <div className="flex justify-between mb-3">
        <h2 className="font-display font-bold">Plan this week</h2>
        <Link className="text-[var(--accent)] text-sm" href="/plan">
          Full plan →
        </Link>
      </div>
      {error ? (
        <p>Could not load your saved plan.</p>
      ) : sessions === null ? (
        <p>Loading plan…</p>
      ) : sessions.length ? (
        sessions.map((s) => (
          <div
            className="flex flex-wrap gap-3 py-3 border-t border-[var(--border)] text-sm"
            key={s.id}
          >
            <span className="font-mono">{s.plan_date}</span>
            <span>{s.description || s.session_type}</span>
            <span className="font-mono text-[var(--text-2)]">
              {s.target_distance_meters
                ? formatDistance(s.target_distance_meters, unit)
                : ''}{' '}
              · {s.status}
            </span>
          </div>
        ))
      ) : (
        <p className="text-sm text-[var(--text-2)]">
          No workouts saved yet. Add your own or generate a week.
        </p>
      )}
    </section>
  )
}
