'use client'
import { localDate } from '@/lib/calendar'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import GoalCard from './GoalCard'
import Eyebrow from './Eyebrow'
import GoalSetupModal from './GoalSetupModal'
import { primaryRace, type UserGoal } from '@/lib/goals'
import { type DistanceUnit } from '@/lib/utils'

interface Props {
  initialGoals: UserGoal[]
  bundle?: import('@/lib/estimates').EstimateBundle
  estimates: Record<string, number> // distance_key → estimated finish secs from analysis
  confidence?: Record<string, number> // distance_key → 0-1 confidence
  sourceCounts?: Record<string, Record<string, number>> // distance_key → { source: count }
  unit?: DistanceUnit
  /** Section number shown in the eyebrow (dashboard only). */
  n?: string
}

export default function GoalsSection({
  initialGoals,
  bundle,
  estimates,
  confidence,
  sourceCounts,
  unit = 'km',
  n,
}: Props) {
  const [goals, setGoals] = useState<UserGoal[]>(initialGoals)
  const [adding, setAdding] = useState(false)

  function handleUpdate(updated: UserGoal) {
    setGoals((gs) =>
      gs.map((g) =>
        g.id === updated.id
          ? updated
          : updated.is_primary
            ? { ...g, is_primary: false }
            : g,
      ),
    )
  }
  function handleDelete(id: string) {
    setGoals((gs) => gs.filter((g) => g.id !== id))
  }
  function handleAdd(added: UserGoal) {
    setGoals((gs) => {
      return [...gs, added].sort((a, b) =>
        a.race_date.localeCompare(b.race_date),
      )
    })
    setAdding(false)
  }

  const cols =
    goals.length >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : goals.length === 2 ? 'sm:grid-cols-2' : ''

  return (
    <section className={`panel grid-cols-1 ${cols} fade-up`}>
      <div className="cell col-span-full" style={{ paddingBottom: 6 }}>
        <Eyebrow
          n={n}
          label="Race goals"
          className="!mb-0"
          right={
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 min-h-[32px] font-bold hover:text-white transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              <Plus size={11} /> Add goal
            </button>
          }
        />
      </div>

      {goals.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────────────────── */
        <div className="cell col-span-full flex flex-col items-start gap-3 py-8">
          <p className="font-display font-extrabold uppercase text-xl">No race goals yet</p>
          <p className="text-sm max-w-sm" style={{ color: 'var(--text-3)' }}>
            Add a goal to track your progress and get tailored analysis for
            your target race.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-black font-bold px-5 py-2.5 rounded-md transition-colors text-sm mt-1"
          >
            <Plus size={14} /> Add your first goal
          </button>
        </div>
      ) : (
        goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={{
              ...goal,
              is_primary: primaryRace(goals, localDate())?.id === goal.id,
            }}
            estimate={bundle?.estimates.find(
              (e) => e.distanceKey === goal.distance_key,
            )}
            trend={bundle?.deltas?.[goal.distance_key]?.month}
            currentEstimateSecs={estimates[goal.distance_key] ?? null}
            confidence={confidence?.[goal.distance_key]}
            sourceCounts={sourceCounts?.[goal.distance_key]}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            unit={unit}
          />
        ))
      )}

      {adding && (
        <GoalSetupModal onSave={handleAdd} onClose={() => setAdding(false)} />
      )}
    </section>
  )
}
