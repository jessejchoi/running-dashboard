'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import GoalCard from './GoalCard'
import GoalSetupModal from './GoalSetupModal'
import { type UserGoal } from '@/lib/goals'
import { type DistanceUnit } from '@/lib/utils'

interface Props {
  initialGoals: UserGoal[]
  estimates: Record<string, number>   // distance_key → estimated finish secs from analysis
  confidence?: Record<string, number> // distance_key → 0-1 confidence
  sourceCounts?: Record<string, Record<string, number>> // distance_key → { source: count }
  unit?: DistanceUnit
}

export default function GoalsSection({ initialGoals, estimates, confidence, sourceCounts, unit = 'km' }: Props) {
  const [goals, setGoals]     = useState<UserGoal[]>(initialGoals)
  const [adding, setAdding]   = useState(false)

  function handleUpdate(updated: UserGoal) {
    setGoals(gs => gs.map(g => g.id === updated.id ? updated : g))
  }
  function handleDelete(id: string) {
    setGoals(gs => gs.filter(g => g.id !== id))
  }
  function handleAdd(added: UserGoal) {
    setGoals(gs => {
      // replace if same distance_key already exists (upsert)
      const filtered = gs.filter(g => g.distance_key !== added.distance_key)
      return [...filtered, added].sort((a, b) => a.race_date.localeCompare(b.race_date))
    })
    setAdding(false)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-[28px] text-[#F4F4F4] uppercase leading-none">My Race Goals</h2>
        <button onClick={() => setAdding(true)}
          className="flex min-h-[44px] items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-[#FF1D6C] hover:text-white border border-[rgba(255,255,255,0.22)] hover:border-[#FF1D6C] px-3 py-2 transition-colors">
          <Plus size={12} /> Add Goal
        </button>
      </div>

      {goals.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────────────────── */
        <div className="card top-stripe-magenta border-dashed border-[rgba(255,255,255,0.22)] flex flex-col items-center justify-center py-10 text-center gap-4">
          <div className="w-12 h-12 bg-[rgba(255,29,108,0.12)] border border-[#FF1D6C] flex items-center justify-center">
            <Plus size={22} color="#FF1D6C" />
          </div>
          <div>
            <p className="font-display font-bold uppercase text-white mb-1">No race goals yet</p>
            <p className="text-[#6A6A6A] text-sm max-w-xs">
              Add a goal to track your progress and get tailored analysis for your target race.
            </p>
          </div>
          <button onClick={() => setAdding(true)}
            className="flex min-h-[44px] items-center gap-2 bg-[#FF1D6C] hover:bg-[#D4185A] text-[#0A0A0A] font-mono font-bold uppercase tracking-[0.18em] px-5 py-2.5 transition-colors text-[11px]">
            <Plus size={14} /> Add your first goal
          </button>
        </div>
      ) : (
        <div className={`grid gap-4 ${goals.length >= 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : goals.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
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
        <GoalSetupModal
          onSave={handleAdd}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  )
}
