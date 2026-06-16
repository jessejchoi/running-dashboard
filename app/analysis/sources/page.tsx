import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import AnalysisSessionDetails from '@/components/AnalysisSessionDetails'
import Link from 'next/link'
import { getAthleteAnalysis } from '@/lib/analysis/service'
import { type DistanceUnit } from '@/lib/utils'

export const revalidate = 60

export default async function SourcesPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  const { inputs, result, combinedJson, targetSecsMap } = await getAthleteAnalysis(Number(athleteId), {
    activityColumns: '*',
    easyLookbackMonths: 3,
    longLimit: 15,
    raceLimit: 10,
    allActivitiesLimit: 200,
  })

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Nav />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 sm:pb-16">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/analysis" className="text-[#6b7280] hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </Link>
          <div>
            <h1 className="font-display font-black text-2xl sm:text-3xl">Run Details</h1>
            <p className="text-[#6b7280] text-sm mt-1">Session charts, source badges, and contributing runs</p>
          </div>
        </div>
        <AnalysisSessionDetails
          inputs={inputs}
          result={result}
          combined={combinedJson}
          targetSecsMap={targetSecsMap}
          unit={unit}
        />
      </main>
    </div>
  )
}
