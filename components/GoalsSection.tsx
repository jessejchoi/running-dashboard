'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import GoalCard from './GoalCard'
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
  /** The viewer's local date. */
  today: string
}

export default function GoalsSection({
  initialGoals,
  bundle,
  estimates,
  confidence,
  sourceCounts,
  unit = 'km',
  today,
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

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest">
          My Race Goals
        </h2>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#f97316] hover:text-white border border-[#f97316]/30 hover:border-[#f97316] px-3 py-2 rounded transition-colors"
        >
          <Plus size={12} /> Add Goal
        </button>
      </div>

      {goals.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────────────────── */
        <div className="card border-dashed border-[#2a2a2a] flex flex-col items-center justify-center py-10 text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#f97316]/10 flex items-center justify-center">
            <span className="text-2xl">🎯</span>
          </div>
          <div>
            <p className="font-bold text-white mb-1">No race goals yet</p>
            <p className="text-[#6b7280] text-sm max-w-xs">
              Add a goal to track your progress and get tailored analysis for
              your target race.
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <Plus size={14} /> Add your first goal
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${goals.length >= 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : goals.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}
        >
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={{
                ...goal,
                is_primary: primaryRace(goals, today)?.id === goal.id,
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
          ))}
        </div>
      )}

      {adding && (
        <GoalSetupModal onSave={handleAdd} onClose={() => setAdding(false)} />
      )}
    </section>
  )
}
