import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GoalCard from '@/components/GoalCard'
import { RACE_GOALS, isoWeek } from '@/lib/utils'
import { type DistanceKey, type UserGoal } from '@/lib/goals'
import { differenceInWeeks } from 'date-fns'

const DISTANCE_TO_KEY: Record<number, DistanceKey> = {
  5000: '5k',
  10000: '10k',
  21097: 'hm',
  42195: 'fm',
}

function staticRaceGoalToUserGoal(goal: (typeof RACE_GOALS)[number], index: number): UserGoal {
  return {
    id: `static-${index}`,
    athlete_id: 0,
    distance_key: DISTANCE_TO_KEY[goal.distance] ?? '5k',
    label: goal.label,
    target_secs: goal.targetTime,
    current_secs: null,
    race_date: goal.raceDate.toISOString(),
  }
}

export default async function GoalsPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')

  const { data: activities } = await supabaseAdmin
    .from('activities')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .order('start_date', { ascending: false })
    .limit(300)

  const runs = activities ?? []

  const weeklyKm: Record<string, number> = {}
  for (const a of runs) {
    const w = isoWeek(new Date(a.start_date))
    weeklyKm[w] = (weeklyKm[w] ?? 0) + a.distance / 1000
  }

  const lastEightWeeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (7 - i) * 7)
    return weeklyKm[isoWeek(d)] ?? 0
  })
  const avgWeeklyKm = lastEightWeeks.reduce((a, b) => a + b, 0) / 8

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-5xl mx-auto px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
        <div className="mb-8 fade-up pb-6" style={{ borderBottom: '2px solid var(--fg-1)' }}>
          <h1
            className="font-display font-bold uppercase"
            style={{ fontSize: 'clamp(40px, 7vw, 72px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}
          >
            RACE GOALS<span style={{ color: 'var(--magenta)' }}>.</span>
          </h1>
          <p className="pulse-label mt-3">2026 SEASON · 3 TARGET RACES</p>
        </div>

        {/* Training context strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'AVG WEEKLY',   value: avgWeeklyKm.toFixed(1), unit: 'KM', bar: 'magenta' as const, tone: 'var(--fg-1)' },
            { label: 'TOTAL RUNS',   value: String(runs.length),    unit: '',   bar: 'acid' as const,    tone: 'var(--acid)' },
            { label: 'WEEKS TO 5K',  value: String(Math.max(0, differenceInWeeks(RACE_GOALS[0].raceDate, new Date()))), unit: 'WKS', bar: 'ice' as const, tone: 'var(--ice)' },
            { label: 'WEEKS TO HM',  value: String(Math.max(0, differenceInWeeks(RACE_GOALS[2].raceDate, new Date()))), unit: 'WKS', bar: 'magenta' as const, tone: 'var(--fg-1)' },
          ].map((s, i) => (
            <div key={i} className={`card pulse-bar ${s.bar === 'acid' ? 'acid' : s.bar === 'ice' ? 'ice' : ''} fade-up`} style={{ animationDelay: `${i * 60}ms` }}>
              <p className="pulse-label" style={{ marginBottom: 8 }}>{s.label}</p>
              <div className="stat-num font-display font-bold" style={{ fontSize: 32, color: s.tone, lineHeight: 1 }}>
                {s.value}
                {s.unit && <span className="font-bold ml-1" style={{ fontSize: '0.4em', color: 'var(--fg-3)' }}>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Goal cards */}
        <div className="flex flex-col gap-5">
          {RACE_GOALS.map((goal, i) => (
            <GoalCard
              key={i}
              goal={staticRaceGoalToUserGoal(goal, i)}
              onUpdate={() => {}}
              onDelete={() => {}}
            />
          ))}
        </div>

        {/* Training notes */}
        <div className="card pulse-bar mt-8 fade-up">
          <p className="pulse-label mb-4">TRAINING NOTES</p>
          <div className="grid md:grid-cols-3 gap-0" style={{ borderTop: '1px solid var(--hair-1)' }}>
            {[
              { color: 'var(--magenta)', title: '5K · APR',  body: 'Focus on interval sessions at <4:20/km. Build speed endurance with 400m–800m reps. Target pace: 4:30/km.' },
              { color: 'var(--acid)',    title: '10K · JUL', body: 'Threshold runs at 4:35–4:45/km. Tempo intervals 2–4km. Weekly mileage 55–65km.' },
              { color: 'var(--ice)',     title: 'HM · OCT',  body: 'Long runs to 18–20km at 5:20–5:30/km. Weekly mileage 65–75km peak. Race pace 4:58/km.' },
            ].map((n, j) => (
              <div key={j} style={{ padding: '1.25rem', borderRight: j < 2 ? '1px solid var(--hair-1)' : 'none' }}>
                <div style={{ height: 3, background: n.color, width: 32, marginBottom: 10 }} />
                <div className="font-display font-bold uppercase mb-2" style={{ fontSize: 16, color: n.color, letterSpacing: '-0.01em' }}>{n.title}</div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-2)' }}>{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
