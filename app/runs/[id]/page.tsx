import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import RunTypeSelector from '@/components/RunTypeSelector'
import SplitsChart from '@/components/SplitsChart'
import { speedToPace, formatDuration } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function RunDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')

  const { data: run } = await supabaseAdmin
    .from('activities')
    .select('*')
    .eq('id', params.id)
    .eq('athlete_id', athleteId)
    .single()

  if (!run) notFound()

  const splits: any[] = run.splits ?? []
  const laps: any[] = run.laps ?? []
  const paceSeconds = run.average_speed ? 1000 / run.average_speed : 0

  return (
    <>
      <Nav />
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-16">
        <Link href="/runs" className="flex items-center gap-2 text-[#6b7280] hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft size={14} /> All runs
        </Link>

        {/* Header */}
        <div className="mb-8 fade-up">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display font-extrabold text-3xl mb-2">{run.name}</h1>
              <p className="text-[#6b7280] text-sm">
                {format(new Date(run.start_date), 'EEEE, MMMM d yyyy · h:mm a')}
              </p>
            </div>
            <RunTypeSelector activityId={run.id} current={run.run_type} />
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 fade-up">
          {[
            { label: 'Distance',  value: (run.distance / 1000).toFixed(2), unit: 'km' },
            { label: 'Avg Pace',  value: speedToPace(run.average_speed),   unit: '/km' },
            { label: 'Time',      value: formatDuration(run.moving_time),  unit: '' },
            { label: 'Elevation', value: run.total_elevation_gain ? `↑${Math.round(run.total_elevation_gain)}` : '—', unit: 'm' },
          ].map((s, i) => (
            <div key={i} className="card">
              <div className="text-[#6b7280] text-xs mb-2">{s.label}</div>
              <div className="stat-num text-2xl font-bold text-[#f97316]">
                {s.value}
                {s.unit && <span className="text-sm text-[#6b7280] ml-1">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 fade-up">
          {[
            { label: 'Avg HR',       value: run.average_heartrate ? `${Math.round(run.average_heartrate)}` : '—', unit: 'bpm' },
            { label: 'Max HR',       value: run.max_heartrate ? `${Math.round(run.max_heartrate)}` : '—',         unit: 'bpm' },
            { label: 'Cadence',      value: run.average_cadence ? `${Math.round(run.average_cadence * 2)}` : '—', unit: 'spm' },
            { label: 'Suffer Score', value: run.suffer_score ?? '—', unit: '' },
          ].map((s, i) => (
            <div key={i} className="card">
              <div className="text-[#6b7280] text-xs mb-2">{s.label}</div>
              <div className="stat-num text-2xl font-bold text-white">
                {s.value}
                {s.unit && <span className="text-sm text-[#6b7280] ml-1">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Splits chart */}
        {splits.length > 0 && (
          <div className="card mb-6 fade-up">
            <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest mb-4">
              Km Splits
            </h2>
            <SplitsChart splits={splits} avgPace={paceSeconds} />
          </div>
        )}

        {/* Laps table */}
        {laps.length > 0 && (
          <div className="card p-0 overflow-hidden fade-up">
            <div className="px-6 py-4 border-b border-[#2a2a2a]">
              <h2 className="font-display font-bold text-sm text-[#6b7280] uppercase tracking-widest">
                Laps ({laps.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    {['Lap', 'Distance', 'Pace', 'Time', 'HR', 'Elev'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b7280] text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {laps.map((lap: any, i: number) => {
                    const lapPace = lap.average_speed ? 1000 / lap.average_speed : 0
                    const isFast = lapPace > 0 && lapPace <= paceSeconds * 0.95
                    const isSlow = lapPace > paceSeconds * 1.05
                    return (
                      <tr key={i} className="border-b border-[#1c1c1c] hover:bg-[#151515] transition-colors">
                        <td className="px-4 py-3 text-[#6b7280] font-mono text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-mono text-[#f97316]">{(lap.distance / 1000).toFixed(2)} km</td>
                        <td className={`px-4 py-3 font-mono font-bold ${isFast ? 'text-emerald-400' : isSlow ? 'text-red-400' : 'text-white'}`}>
                          {speedToPace(lap.average_speed)}/km
                        </td>
                        <td className="px-4 py-3 font-mono text-[#9ca3af]">{formatDuration(lap.moving_time)}</td>
                        <td className="px-4 py-3 font-mono text-[#9ca3af]">
                          {lap.average_heartrate ? `${Math.round(lap.average_heartrate)}` : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#9ca3af]">
                          {lap.total_elevation_gain ? `↑${Math.round(lap.total_elevation_gain)}m` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!run.detail_synced && (
          <div className="card text-center text-[#6b7280] text-sm fade-up">
            Lap data not yet synced. Use the "Sync lap data" button on the runs page.
          </div>
        )}
      </main>
    </>
  )
}
