import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import RunTypeSelector from '@/components/RunTypeSelector'
import { speedToPace, formatDuration, toJakartaDate, formatDistance, paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'

export const revalidate = 60

export default async function RunsPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  const { data: runs } = await supabaseAdmin
    .from('activities')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .order('start_date', { ascending: false })
    .limit(500)

  const activities = runs ?? []

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold uppercase leading-none" style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}>Activity Log</h1>
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
                {activities.map((run: any) => {
                  const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
                  const isFast = paceSeconds <= 270
                  const isTreadmill = run.run_type === 'treadmill' || run.raw?.trainer === true
                  return (
                    <tr key={run.id} className="transition-colors" style={{ borderBottom: '1px solid var(--surface-2)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className={`px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-muted)' }}>
                        <Link href={`/runs/${run.id}`} className="transition-colors hover:text-white" style={{ color: 'inherit' }}>
                          {format(toJakartaDate(run.start_date), 'MMM d, yyyy')}
                        </Link>
                        {isTreadmill && <span className="ml-2 text-[10px]" style={{ color: 'var(--text-3)' }}>🏃</span>}
                      </td>
                      <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                        <RunTypeSelector activityId={run.id} current={run.run_type} />
                      </td>
                      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--orange)' }}>
                        {formatDistance(run.distance, unit)}
                      </td>
                      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap font-bold ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: isFast ? 'var(--success)' : 'var(--text-2)' }}>
                        {speedToPace(run.average_speed, unit)}{paceUnitLabel(unit)}
                      </td>
                      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-2)' }}>
                        {formatDuration(run.moving_time)}
                      </td>
                      <td className={`px-2 sm:px-4 py-2 sm:py-3 font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-2)' }}>
                        {run.average_heartrate ? `${Math.round(run.average_heartrate)} bpm` : '—'}
                      </td>
                      <td className={`px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`} style={{ color: 'var(--text-2)' }}>
                        {run.suffer_score ?? '—'}
                      </td>
                    </tr>
                  )
                })}
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
