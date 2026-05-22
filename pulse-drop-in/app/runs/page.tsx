import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { type DistanceUnit } from '@/lib/utils'
import RunRow from '@/components/RunRow'

export const revalidate = 60

export default async function RunsPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  const { data: runs } = await supabaseAdmin
    .from('activities')
    .select('id, start_date, distance, moving_time, average_speed, average_heartrate, suffer_score, run_type, run_type_manual, type, name')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .order('start_date', { ascending: false })
    .limit(500)

  const activities = runs ?? []

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
        <div className="mb-8 fade-up pb-6" style={{ borderBottom: '2px solid var(--fg-1)' }}>
          <h1
            className="font-display font-bold uppercase"
            style={{ fontSize: 'clamp(40px, 7vw, 72px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}
          >
            ACTIVITY LOG<span style={{ color: 'var(--magenta)' }}>.</span>
          </h1>
          <p className="pulse-label mt-3">{activities.length} RUNS · STRAVA SYNC LIVE</p>
        </div>

        <div className="card pulse-bar p-0 overflow-hidden fade-up" style={{ padding: 0 }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--fg-1)' }}>
                  {['DATE', 'TYPE', 'DISTANCE', 'PACE', 'TIME', 'HR', 'TSS'].map(h => (
                    <th
                      key={h}
                      className="text-left px-2 sm:px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] whitespace-nowrap"
                      style={{ color: 'var(--fg-3)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.map((run: any) => (
                  <RunRow key={run.id} run={run} unit={unit} />
                ))}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 sm:px-4 py-12 text-center font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--fg-3)' }}>
                      No runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  )
}
