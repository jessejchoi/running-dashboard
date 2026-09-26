import { format, parseISO } from 'date-fns'
import { loadRhythmSummaries } from '@/lib/rhythmData'
import { freezeLoadedWeeks } from '@/lib/rhythmLedger'
import RhythmCell from '@/components/RhythmCell'

/** Deferred dashboard section: renders nothing while Rhythm is off. */
export default async function DashboardRhythmSection({ athleteId, today }: { athleteId: number; today: string }) {
  let summaries
  try {
    summaries = await loadRhythmSummaries([athleteId])
  } catch (error) {
    console.error('[dashboard] Rhythm unavailable', error)
    return null
  }
  if (!summaries) return null
  const rhythm = summaries.byAthlete[athleteId]

  if (!rhythm) {
    return (
      <div className="card fade-up mb-3" style={{ padding: '1rem 1.25rem' }}>
        <p className="font-mono text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Rhythm</p>
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          Starts {format(parseISO(summaries.launchWeek), 'EEE, MMM d')}. Everyone begins Unarmed; hit your weekly runs target to level up your weapon.
        </p>
      </div>
    )
  }

  // Safety net for the daily freeze: catch this runner's ledger up if it fell behind.
  if (rhythm.unfrozenWeeks > 0) {
    await freezeLoadedWeeks(summaries.inputs, summaries.launchWeek, summaries.now)
      .catch(error => console.error('[dashboard] Rhythm freeze failed', error))
  }
  return <RhythmCell rhythm={rhythm} today={today} />
}
