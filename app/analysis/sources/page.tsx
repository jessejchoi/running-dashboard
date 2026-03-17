import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import {
  analyzeAllAndCombine,
  type CombinedEstimate,
} from '@/lib/analysis'
import { type DistanceKey } from '@/lib/goals'
import { subMonths } from 'date-fns'
import SourcesPageClient from '@/components/SourcesPageClient'
import Link from 'next/link'

export const revalidate = 60

const EASY_RUN_TYPES = ['easy', 'easy_strides', 'long_easy', 'recovery']

export default async function SourcesPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) redirect('/')

  const [{ data: goalRows }, { data: userProfile }] = await Promise.all([
    supabaseAdmin.from('user_goals').select('distance_key, target_secs').eq('athlete_id', parseInt(athleteId)),
    supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', athleteId).maybeSingle(),
  ])
  const maxHr: number | undefined = userProfile?.max_hr ?? undefined
  const targetSecsMap: Record<string, number> = {}
  for (const g of goalRows ?? []) {
    targetSecsMap[g.distance_key] = g.target_secs
  }

  const [{ data: intervalRuns }, { data: thresholdRuns }, { data: longRuns }, { data: easyRuns }, { data: allActivities }] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('run_type', 'interval_5k').order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('run_type', 'threshold').order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('run_type', 'long').order('start_date', { ascending: false }).limit(15),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', EASY_RUN_TYPES).gte('start_date', subMonths(new Date(), 3).toISOString()).order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('start_date, run_type').eq('athlete_id', athleteId).eq('type', 'Run').not('run_type', 'is', null).order('start_date', { ascending: false }).limit(200),
  ])

  let raceRuns: any[] = []
  try {
    const { data } = await supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('is_race', true).order('start_date', { ascending: false }).limit(10)
    raceRuns = data ?? []
  } catch { /* column doesn't exist yet */ }

  let result: ReturnType<typeof analyzeAllAndCombine>
  try {
    result = analyzeAllAndCombine(
      intervalRuns ?? [],
      thresholdRuns ?? [],
      longRuns ?? [],
      easyRuns ?? [],
      raceRuns,
      maxHr ?? 195,
      allActivities ?? [],
    )
  } catch (err) {
    console.error('analyzeAllAndCombine failed:', err)
    result = {
      intervalEstimates: [], thresholdEstimates: [], longRunAnalyses: [],
      raceAnalyses: [], easyRunResults: [], easyTrendEstimates: [],
      allRaceEstimates: [],
      combined: { '5k': null, '10k': null, 'hm': null, 'fm': null },
    }
  }

  const combinedJson = JSON.parse(JSON.stringify(result.combined)) as Record<DistanceKey, CombinedEstimate | null>

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Nav />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/analysis" className="text-[#6b7280] hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </Link>
          <div>
            <h1 className="font-display font-black text-2xl sm:text-3xl">Contributing Sources</h1>
            <p className="text-[#6b7280] text-sm mt-1">Breakdown of estimates by training signal</p>
          </div>
        </div>
        <SourcesPageClient combined={combinedJson} targetSecsMap={targetSecsMap} />
      </main>
    </div>
  )
}
