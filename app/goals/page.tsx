import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GoalCard from '@/components/GoalCard'
import { RACE_GOALS, speedToPace, metersToKm, isoWeek } from '@/lib/utils'
import { differenceInWeeks } from 'date-fns'

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

  // Weekly volume trend (last 8 weeks)
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
      <main className="max-w-5xl mx-auto px-6 pt-24 pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold text-4xl mb-1">Race Goals</h1>
          <p className="text-[#6b7280] text-sm">
            Tracking your path to three target races in 2026
          </p>
        </div>

        {/* Training context */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {[
            { label: 'Avg weekly km', value: avgWeeklyKm.toFixed(1), unit: 'km' },
            { label: 'Total runs', value: String(runs.length), unit: '' },
            { label: 'Weeks to 5K', value: String(Math.max(0, differenceInWeeks(RACE_GOALS[0].raceDate, new Date()))), unit: 'wks' },
            { label: 'Weeks to HM', value: String(Math.max(0, differenceInWeeks(RACE_GOALS[2].raceDate, new Date()))), unit: 'wks' },
          ].map((s, i) => (
            <div key={i} className="card fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="text-[#6b7280] text-xs mb-2">{s.label}</div>
              <div className="stat-num text-2xl font-bold">
                {s.value}
                {s.unit && <span className="text-sm text-[#6b7280] ml-1">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Goal cards */}
        <div className="flex flex-col gap-5">
          {RACE_GOALS.map((goal, i) => (
            <GoalCard key={i} goal={goal} activities={runs} />
          ))}
        </div>

        {/* Training tips section */}
        <div className="card mt-8 fade-up">
          <h2 className="font-display font-bold text-base mb-4">Training Notes</h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="border-l-2 border-[#f97316] pl-3">
              <div className="font-semibold mb-1 text-[#f97316]">5K — Mid April</div>
              <p className="text-[#9ca3af]">
                Focus on interval sessions at &lt;4:20/km. Build speed endurance with 400m–800m reps.
                Target pace: 4:30/km.
              </p>
            </div>
            <div className="border-l-2 border-[#6b7280] pl-3">
              <div className="font-semibold mb-1">10K — Mid July</div>
              <p className="text-[#9ca3af]">
                Threshold runs at 4:35–4:45/km. Tempo intervals 2–4km. Weekly mileage 55–65km.
              </p>
            </div>
            <div className="border-l-2 border-[#6b7280] pl-3">
              <div className="font-semibold mb-1">Half Marathon — Oct</div>
              <p className="text-[#9ca3af]">
                Long runs to 18–20km at 5:20–5:30/km. Weekly mileage 65–75km peak. Race pace 4:58/km.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
