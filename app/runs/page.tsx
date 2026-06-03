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
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold uppercase" style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}>Activity Log</h1>
          <p className="font-mono text-xs mt-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{activities.length} runs</p>
        </div>

        <div className="card p-0 overflow-hidden fade-up">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Type', 'Distance', 'Avg Pace', 'Time', 'HR', 'Suffer'].map(h => (
                    <th key={h} className="text-left px-2 sm:px-4 py-2 sm:py-3 font-mono text-[10px] uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.map((run: any) => (
                  <RunRow key={run.id} run={run} unit={unit} />
                ))}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 sm:px-4 py-8 sm:py-12 text-center" style={{ color: 'var(--text-muted)' }}>No runs yet.</td>
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
