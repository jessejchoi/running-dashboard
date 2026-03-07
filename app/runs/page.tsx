import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import RunTypeSelector from '@/components/RunTypeSelector'
import { speedToPace, formatDuration, toJakartaDate } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'

export default async function RunsPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')

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
      <main className="max-w-6xl mx-auto px-6 pt-24 pb-16">
        <div className="flex items-center justify-between mb-8 fade-up">
          <div>
            <h1 className="font-display font-extrabold text-3xl leading-normal pb-1 mb-1">Activity Log</h1>
            <p className="text-[#6b7280] text-sm">{activities.length} runs</p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden fade-up">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {['Date', 'Type', 'Distance', 'Avg Pace', 'Time', 'HR', 'Suffer'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[#6b7280] text-xs font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.map((run: any) => {
                  const paceSeconds = run.average_speed ? 1000 / run.average_speed : 999
                  const isFast = paceSeconds <= 270
                  const isTreadmill = run.run_type === 'treadmill' || run.raw?.trainer === true
                  return (
                    <tr key={run.id} className="border-b border-[#1c1c1c] hover:bg-[#151515] transition-colors">
                      <td className={`px-4 py-3 text-xs font-mono whitespace-nowrap ${isTreadmill ? 'opacity-40 text-[#6b7280]' : 'text-[#6b7280]'}`}>
                        <Link href={`/runs/${run.id}`} className="hover:text-[#f97316] transition-colors">
                          {format(toJakartaDate(run.start_date), 'MMM d, yyyy')}
                        </Link>
                        {isTreadmill && <span className="ml-2 text-[10px] text-zinc-500">🏃</span>}
                      </td>
                      <td className="px-4 py-2">
                        <RunTypeSelector activityId={run.id} current={run.run_type} />
                      </td>
                      <td className={`px-4 py-3 font-mono text-[#f97316] whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`}>
                        {(run.distance / 1000).toFixed(2)} km
                      </td>
                      <td className={`px-4 py-3 font-mono whitespace-nowrap font-bold ${isTreadmill ? 'opacity-40 text-white' : isFast ? 'text-emerald-400' : 'text-white'}`}>
                        {speedToPace(run.average_speed)}/km
                      </td>
                      <td className={`px-4 py-3 font-mono text-[#9ca3af] whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`}>
                        {formatDuration(run.moving_time)}
                      </td>
                      <td className={`px-4 py-3 font-mono text-[#9ca3af] whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`}>
                        {run.average_heartrate ? `${Math.round(run.average_heartrate)} bpm` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-[#9ca3af] whitespace-nowrap ${isTreadmill ? 'opacity-40' : ''}`}>
                        {run.suffer_score ?? '—'}
                      </td>
                    </tr>
                  )
                })}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[#6b7280]">No runs yet.</td>
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
