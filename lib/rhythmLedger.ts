import { supabaseAdmin } from '@/lib/supabase'
import { localDate } from '@/lib/calendar'
import { weeksToFreeze, type RhythmInputs } from '@/lib/rhythm'
import { loadRhythmInputs, rhythmLaunchWeek } from '@/lib/rhythmData'

const UPSERT_CHUNK = 500

/**
 * Runners whose Strava history is fully imported. Freezing an athlete mid-import
 * would lock in weeks with missing runs, so they wait. Athletes with no import
 * row predate the importer and are complete.
 */
async function historyComplete(ids: number[]): Promise<Set<number>> {
  const { data, error } = await supabaseAdmin
    .from('history_imports')
    .select('athlete_id,status')
    .in('athlete_id', ids)
  if (error) throw error
  const pending = new Set((data ?? []).filter(r => r.status !== 'complete').map(r => r.athlete_id))
  return new Set(ids.filter(id => !pending.has(id)))
}

/**
 * Freeze every finished week past its grace period, from inputs already loaded.
 * Idempotent: frozen rows are never rewritten (insert … on conflict do nothing),
 * so the daily cron and the dashboard can both call it. Returns rows written.
 */
export async function freezeLoadedWeeks(inputs: Record<number, RhythmInputs>, launchWeek: string, now = new Date()): Promise<number> {
  const ready = Object.entries(inputs)
    .map(([id, input]) => ({ id: Number(id), rows: weeksToFreeze(input, launchWeek, localDate(now, input.zone)) }))
    .filter(r => r.rows.length)
  if (!ready.length) return 0
  const complete = await historyComplete(ready.map(r => r.id))
  const rows = ready
    .filter(r => complete.has(r.id))
    .flatMap(r => r.rows.map(row => ({ athlete_id: r.id, ...row })))
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await supabaseAdmin
      .from('rhythm_weeks')
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: 'athlete_id,week_start', ignoreDuplicates: true })
    if (error) throw error
  }
  return rows.length
}

/** Load and freeze. Returns the number of rows written, or null when Rhythm is off. */
export async function freezeRhythmWeeks(ids: number[], now = new Date()): Promise<number | null> {
  const launchWeek = rhythmLaunchWeek()
  if (!launchWeek || !ids.length) return null
  const inputs = await loadRhythmInputs(ids, launchWeek, now)
  if (!inputs) return null
  return freezeLoadedWeeks(inputs, launchWeek, now)
}
