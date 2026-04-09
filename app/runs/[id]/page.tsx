import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import RunTypeSelector from '@/components/RunTypeSelector'
import SplitsChart from '@/components/SplitsChart'
import { buildLapSegments } from '@/lib/lapUtils'
import HRChart from '@/components/HRChart'
import { speedToPace, formatDuration, toJakartaDate, formatDistance, paceUnitLabel, aggregateToMileSplits, type DistanceUnit } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function RunDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  const { data: run } = await supabaseAdmin
    .from('activities')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!run) notFound()

  const rawSplits: any[] = run.splits ?? []
  const splits = unit === 'miles' ? aggregateToMileSplits(rawSplits) : rawSplits
  const laps: any[] = run.laps ?? []
  // Prefer run-level average_speed; fall back to median of laps for better interval detection
  let paceSeconds = run.average_speed ? 1000 / run.average_speed : 0
  if (!paceSeconds && laps.length > 0) {
    const lapPaces = laps.filter((l: any) => l.average_speed).map((l: any) => 1000 / l.average_speed)
    if (lapPaces.length) {
      lapPaces.sort((a: number, b: number) => a - b)
      paceSeconds = lapPaces[Math.floor(lapPaces.length / 2)]
    }
  }
  // Build segments for any run with laps (including single-lap for HR overlay)
  const lapSegments = laps.length > 0 ? buildLapSegments(laps, paceSeconds, run.run_type) : []

  // Fetch HR stream from Strava if available (stored in raw or streams column)
  const streams = run.streams ?? null

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-4xl mx-auto px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
        <Link href="/runs" className="flex items-center gap-2 text-sm mb-6 transition-colors" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> All runs
        </Link>

        {/* Header */}
        <div className="mb-8 fade-up">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display font-extrabold uppercase mb-2" style={{ fontSize: 'clamp(22px, 5vw, 40px)', letterSpacing: '-0.02em' }}>{run.name}</h1>
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {format(toJakartaDate(run.start_date), 'EEE, MMM d yyyy · h:mm a')}
              </p>
            </div>
            <div className="relative z-[100]">
              <RunTypeSelector activityId={run.id} current={run.run_type} isManual={run.run_type_manual ?? false} />
            </div>
          </div>
        </div>

        {/* Key stats — 4 cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 fade-up">
          {[
            { label: 'Distance',  value: formatDistance(run.distance, unit).split(' ')[0], unit: unit === 'miles' ? 'mi' : 'km' },
            { label: 'Avg Pace',  value: speedToPace(run.average_speed, unit), unit: paceUnitLabel(unit) },
            { label: 'Time',      value: formatDuration(run.moving_time),  unit: '' },
            { label: 'Elevation', value: run.total_elevation_gain ? `↑${Math.round(run.total_elevation_gain)}` : '—', unit: 'm' },
          ].map((s, i) => (
            <div key={i} className="card">
              <p className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              <div className="stat-num text-2xl font-bold" style={{ color: 'var(--orange)' }}>
                {s.value}
                {s.unit && <span className="text-sm ml-1" style={{ color: 'var(--text-muted)' }}>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 gap-3 mb-8 fade-up">
          {[
            { label: 'Cadence',      value: run.average_cadence ? `${Math.round(run.average_cadence * 2)}` : '—', unit: 'spm' },
            { label: 'Suffer Score', value: run.suffer_score ?? '—', unit: '' },
          ].map((s, i) => (
            <div key={i} className="card">
              <p className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              <div className="stat-num text-2xl font-bold text-white">
                {s.value}
                {s.unit && <span className="text-sm ml-1" style={{ color: 'var(--text-muted)' }}>{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* HR Chart */}
        {run.average_heartrate && (
          <div className="card mb-6 fade-up">
            <p className="font-mono text-[10px] uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Heart Rate</p>
            <div className="pb-4">
            <HRChart
              streams={streams}
              avgHR={run.average_heartrate}
              maxHR={run.max_heartrate}
              lapSegments={lapSegments}
            />
            </div>
          </div>
        )}

        {/* Splits */}
        {splits.length > 0 && (
          <div className="card mb-6 fade-up">
            <p className="font-mono text-[10px] uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
              {unit === 'miles' ? 'Mile Splits' : 'Km Splits'}
            </p>
            <div className="pb-4">
            <SplitsChart splits={splits} avgPace={paceSeconds} label="km" colorMode="uniform" runType={run.run_type} unit={unit} />
            </div>
          </div>
        )}

        {/* Laps */}
        {laps.length > 0 && (
          <div className="card mb-6 fade-up">
            <p className="font-mono text-[10px] uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
              Laps ({laps.length})
            </p>
            <div className="pb-4">
            <SplitsChart splits={laps} avgPace={paceSeconds} label="lap" showDistance={true} colorMode="lap-type" runType={run.run_type} kmSplitCount={rawSplits.length} unit={unit} />
            </div>
          </div>
        )}

        {!run.detail_synced && (
          <div className="card text-center text-sm fade-up" style={{ color: 'var(--text-muted)' }}>
            Lap data not yet synced. Use "Sync Strava" to fetch lap data.
          </div>
        )}
      </main>
    </>
  )
}
