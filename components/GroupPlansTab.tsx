'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { type Member, type Group } from './GroupShared'
export default function GroupPlansTab({
  group,
  members,
  initialPlans,
  today,
}: {
  group: Group
  members: Member[]
  myAthleteId: number
  initialPlans?: any[]
  /** The viewer's local date. */
  today: string
}) {
  const [plans, setPlans] = useState<any[]>(initialPlans ?? []),
    [error, setError] = useState('')
  useEffect(() => {
    fetch(`/api/groups/${group.id}/plans?today=${today}`)
      .then(async (r) => {
        if (!r.ok) throw 0
        const b = await r.json()
        setPlans(b.plans ?? [])
      })
      .catch(() => setError('Could not load group plans'))
  }, [group.id, today])
  return (
    <section className="card">
      <div className="flex justify-between mb-4">
        <h2 className="font-display text-xl font-bold">Group training</h2>
        <Link className="text-[var(--accent)] py-3" href="/plan">
          Edit your plan →
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
      {!plans.length && <p>No upcoming sessions.</p>}
      {plans.map((p) => (
        <div className="py-3 border-t border-[var(--border)]" key={p.id}>
          <p className="font-mono text-xs text-[var(--text-3)]">
            {p.plan_date} ·{' '}
            {members.find((m) => m.athlete_id === p.athlete_id)?.name ??
              'Member'}
          </p>
          <p className="text-sm mt-1">
            {p.description || p.session_type}
            {p.target_distance_meters
              ? ` · ${(p.target_distance_meters / 1000).toFixed(1)} km`
              : ''}
          </p>
        </div>
      ))}
    </section>
  )
}
