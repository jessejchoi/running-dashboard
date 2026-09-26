import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { localDate, addDays, weekday } from '@/lib/calendar'
import Eyebrow from '@/components/Eyebrow'
import { type DistanceUnit, formatDistance } from '@/lib/utils'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Plan session type → DESIGN.md run-type colour.
const TYPE_COLOR: Record<string, string> = {
  easy: 'var(--success)',
  easy_strides: 'var(--success)',
  recovery: 'var(--success)',
  threshold: 'var(--warning)',
  tempo: 'var(--warning)',
  interval_5k: 'var(--accent)',
  race: 'var(--accent)',
  long_easy: 'var(--info)',
  rest: 'var(--text-4)',
}

function PlanCardShell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="panel grid-cols-1 sm:grid-cols-7 mb-3 fade-up">
      <div className="cell col-span-full" style={{ paddingBottom: 6 }}>
        <Eyebrow
          n="07"
          label="Plan this week"
          right={<>{right}{right ? <span style={{ color: 'var(--text-4)' }}> · </span> : null}<Link href="/plan" prefetch={true}>Full plan →</Link></>}
          className="!mb-0"
        />
      </div>
      {children}
    </section>
  )
}

export function WeeklyPlanCardSkeleton() {
  return (
    <PlanCardShell>
      {[...Array(7)].map((_, i) => (
        <div key={i} className="cell animate-pulse h-14 sm:h-[118px]" />
      ))}
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

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const planned = sessions.filter((s) => s.status !== 'skipped')
  const total = planned.reduce((n, s) => n + (s.target_distance_meters ?? 0), 0)
  const done = planned
    .filter((s) => s.status === 'completed')
    .reduce((n, s) => n + (s.target_distance_meters ?? 0), 0)

  if (!sessions.length) {
    return (
      <PlanCardShell>
        <p className="cell col-span-full text-sm" style={{ color: 'var(--text-2)', paddingTop: 10 }}>
          No workouts saved yet. Add your own or generate a week.
        </p>
      </PlanCardShell>
    )
  }

  return (
    <PlanCardShell right={total > 0 ? `${formatDistance(done, unit)} / ${formatDistance(total, unit)}` : undefined}>
      {days.map((date) => {
        const daySessions = sessions.filter((s) => s.plan_date === date)
        const first = daySessions[0]
        const type = first?.session_type ?? 'rest'
        const isToday = date === today
        const allDone = daySessions.length > 0 && daySessions.every((s) => s.status === 'completed')
        const skipped = daySessions.length > 0 && daySessions.every((s) => s.status === 'skipped')
        const km = daySessions.reduce((n, s) => n + (s.target_distance_meters ?? 0), 0)
        const label = daySessions.map((s) => s.description || s.session_type).join(' + ') || 'Rest'
        return (
          <Link
            key={date}
            href="/plan"
            prefetch={false}
            className="cell relative flex sm:flex-col items-center sm:items-stretch gap-3 sm:gap-0 transition-colors hover:bg-[var(--surface-2)]"
            style={{
              paddingTop: 16,
              paddingBottom: 16,
              background: isToday ? 'var(--surface-2)' : undefined,
              boxShadow: isToday ? 'inset 0 0 0 1px rgba(249,115,22,.35)' : undefined,
            }}
          >
            {/* Type rule: left edge on mobile, top edge on desktop */}
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-[3px] sm:bottom-auto sm:right-0 sm:w-auto sm:h-[2px]"
              style={{ background: TYPE_COLOR[type] ?? 'var(--text-3)', opacity: type === 'rest' ? 0.4 : 0.9 }}
            />
            <span
              className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] flex justify-between w-14 sm:w-auto shrink-0"
              style={{ color: isToday ? 'var(--accent)' : 'var(--text-3)' }}
            >
              <span>{isToday ? 'Today' : `${DAY_NAMES[weekday(date)]} ${date.slice(8)}`}</span>
              <span className="hidden sm:inline">
                {allDone ? <span style={{ color: 'var(--success)' }}>✓</span> : isToday ? '●' : null}
              </span>
            </span>
            <span
              className="text-[13px] font-medium leading-snug flex-1 sm:flex-none sm:mt-3.5 sm:min-h-[34px] truncate sm:whitespace-normal sm:line-clamp-2"
              style={{ color: allDone || skipped ? 'var(--text-2)' : 'var(--text-1)', textDecoration: skipped ? 'line-through' : undefined }}
            >
              {label}
            </span>
            <span
              className="stat-num text-[13px] sm:text-[15px] font-bold sm:mt-1.5 shrink-0"
              style={{ color: allDone ? 'var(--text-2)' : 'var(--text-1)' }}
            >
              {km > 0 ? formatDistance(km, unit) : <span style={{ color: 'var(--text-4)' }}>—</span>}
            </span>
            <span className="sm:hidden w-3 text-[11px] font-mono shrink-0">
              {allDone ? <span style={{ color: 'var(--success)' }}>✓</span> : isToday ? <span style={{ color: 'var(--accent)' }}>●</span> : null}
            </span>
          </Link>
        )
      })}
    </PlanCardShell>
  )
}
