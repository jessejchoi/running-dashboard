import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import AnalysisDistanceSection from '@/components/AnalysisDistanceSection'
import AthleteFeaturesSection from '@/components/AthleteFeaturesSection'
import { AnalysisTabProvider } from '@/components/AnalysisTabContext'
import { fetchDeltas, saveSnapshot, type AllDeltas } from '@/lib/estimateSnapshots'
import { getAthleteAnalysis } from '@/lib/analysis/service'

export const revalidate = 60

export default async function AnalysisPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')

  const {
    inputs: { hasMaxHr },
    combinedJson,
    currentEstimates,
    targetSecsMap,
    snapshotExtras,
    projection,
  } = await getAthleteAnalysis(Number(athleteId), {
    easyLookbackMonths: 3,
    longLimit: 15,
    raceLimit: 10,
    allActivitiesLimit: 200,
  })

  // Fetch historical deltas (cheap indexed query) + save today's snapshot (non-blocking)
  await saveSnapshot(Number(athleteId), currentEstimates, snapshotExtras ?? undefined)
  const allDeltas: AllDeltas = await fetchDeltas(Number(athleteId), currentEstimates)

  return (
    <>
      <Nav />
      <AnalysisTabProvider>
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
        <div className="mb-8 fade-up">
          <h1 className="font-display font-extrabold text-4xl mb-1">Race Analysis</h1>
          <p className="text-[#6b7280] text-sm max-w-3xl">
            {projection
              ? 'Critical-pace fit across your best efforts, plus aerobic, endurance, and form features — projected to today and ideal conditions with a confidence band.'
              : 'Multi-distance estimates from intervals, tempo, long runs, easy trends, and race results — combined with confidence and recency weighting.'}
          </p>
          {!hasMaxHr && (
            <div className="flex items-center gap-2 bg-[#1a1a0a] border border-[#f97316]/30 rounded-xl px-4 py-3 mt-4 text-sm max-w-xl">
              <span className="text-[#f97316] shrink-0">⚠</span>
              <span className="text-[#9ca3af]">HR-based corrections use a default max HR of 195 bpm — open <span className="text-white font-medium">Settings</span> (gear icon) to add your actual max HR.</span>
            </div>
          )}
        </div>

        {/* Distance Tabs + Combined Estimate + Source Cards */}
        <AnalysisDistanceSection
          combined={combinedJson}
          targetSecsMap={targetSecsMap}
          allDeltas={allDeltas}
          extrasMap={snapshotExtras ? Object.fromEntries(
            Object.entries(snapshotExtras).map(([dk, e]) => [dk, {
              idealSecs: e.idealSecs ?? null,
              todaySecs: e.todaySecs ?? null,
              p80LowSecs: e.p80LowSecs ?? null,
              p80HighSecs: e.p80HighSecs ?? null,
            }])
          ) : null}
        />

        {/* New: feature-based fitness profile (Speed / Aerobic / Endurance / Form).
            Only renders when the CP engine has produced a projection — legacy mode
            falls back to surfacing only the per-source detail below. */}
        {projection && <AthleteFeaturesSection projection={projection} />}
      </main>
      </AnalysisTabProvider>
    </>
  )
}
