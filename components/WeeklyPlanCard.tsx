import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { localDate, addDays } from '@/lib/calendar'
import { type DistanceUnit, formatDistance } from '@/lib/utils'

function PlanCardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="card my-6">
      <div className="flex justify-between mb-3">
        <h2 className="font-display font-bold">Plan this week</h2>
        <Link className="text-[var(--accent)] text-sm" href="/plan" prefetch={true}>
          Full plan →
        </Link>
      </div>
      {children}
    </section>
  )
}

export function WeeklyPlanCardSkeleton() {
  return (
    <PlanCardShell>
      <div className="animate-pulse space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-5 bg-[#1c1c1c] rounded" />
        ))}
      </div>
    </PlanCardShell>
  )
}

/** Server-rendered next-7-days view; reads only the rows it shows. */
export default async function WeeklyPlanCard({
  athleteId,
  unit,
}: {
  athleteId: number
  unit: DistanceUnit
}) {
  // Query a day of slack either side of the Jakarta window so any saved
  // timezone still finds its own "today", then filter precisely below.
  const anchor = localDate()
  const [{ data: prefs }, { data: rows, error }] = await Promise.all([
    supabaseAdmin
      .from('training_preferences')
      .select('config')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    supabaseAdmin
      .from('user_plans')
      .select('id,plan_date,session_index,description,session_type,target_distance_meters,status')
      .eq('athlete_id', athleteId)
      .gte('plan_date', addDays(anchor, -1))
      .lte('plan_date', addDays(anchor, 8))
      .order('plan_date')
      .order('session_index'),
  ])

  if (error) {
    return (
      <PlanCardShell>
        <p>Could not load your saved plan.</p>
      </PlanCardShell>
    )
  }

  let today = anchor
  try {
    today = localDate(new Date(), prefs?.config?.timezone ?? 'Asia/Jakarta')
  } catch {}
  const sessions = (rows ?? []).filter(
    (s) => s.plan_date >= today && s.plan_date < addDays(today, 7),
  )

  return (
    <PlanCardShell>
      {sessions.length ? (
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
    </PlanCardShell>
  )
}
