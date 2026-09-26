import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

/**
 * Refold Rhythm ledgers from launch week: delete an athlete's frozen
 * rhythm_weeks rows, then freeze again from their full run history. Run after
 * bumping RHYTHM_RULES_VERSION, or to repair a rule bug.
 *
 *   npm run rhythm:rebuild -- 12345        one athlete
 *   npm run rhythm:rebuild -- --all        every connected athlete
 */
async function main() {
  const { supabaseAdmin } = await import('../lib/supabase')
  const { fetchAllPages } = await import('../lib/fetchAllPages')
  const { freezeRhythmWeeks } = await import('../lib/rhythmLedger')
  const { rhythmLaunchWeek } = await import('../lib/rhythmData')
  // Check before deleting anything: with Rhythm off, nothing could be refolded.
  const launchWeek = rhythmLaunchWeek()
  if (!launchWeek) throw new Error('Rhythm is off here: set RHYTHM_LAUNCH_WEEK (the same Monday as production) in .env.local')
  console.log(`Refolding from launch week ${launchWeek}`)
  const arg = process.argv[2]
  if (!arg) throw new Error('Usage: npm run rhythm:rebuild -- <athleteId|--all>')
  const ids = arg === '--all'
    ? (await fetchAllPages<{ athlete_id: number }>(() => supabaseAdmin.from('strava_tokens').select('athlete_id').order('athlete_id'))).map(t => t.athlete_id)
    : [Number(arg)]
  if (ids.some(id => !Number.isInteger(id))) throw new Error(`Not an athlete id: ${arg}`)

  for (const id of ids) {
    const { error } = await supabaseAdmin.from('rhythm_weeks').delete().eq('athlete_id', id)
    if (error) throw error
    // Rows appear again once the athlete's history import is complete.
    const frozen = await freezeRhythmWeeks([id])
    if (frozen == null) throw new Error('rhythm_weeks is missing: apply migration_024.sql')
    console.log(`athlete ${id}: ${frozen} weeks refolded`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
