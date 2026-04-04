import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import OnboardingPage from '@/components/OnboardingPage'
import WeeklyMileageChart from '@/components/WeeklyMileageChart'
import GoalsSection from '@/components/GoalsSection'
import TrainingLoadChart from '@/components/TrainingLoadChart'
import RunTypeBadge from '@/components/RunTypeBadge'
import { formatDuration, speedToPace, isoWeek, toJakartaDate, formatDistanceShort, distanceUnitLabel, paceUnitLabel, type DistanceUnit } from '@/lib/utils'
import { calculateTrainingLoad } from '@/lib/strava'
import { analyzeAllAndCombine } from '@/lib/analysis'
import Link from 'next/link'
import GroupLeaderboard from '@/components/GroupLeaderboard'
import GroupFeed from '@/components/GroupFeed'
import GroupGoalsSection from '@/components/GroupGoalsSection'
import GroupCoachTab from '@/components/GroupCoachTab'
import { format } from 'date-fns'
import { type UserGoal } from '@/lib/goals'

export const dynamic = 'force-dynamic'

async function getData(athleteId: number) {
  const EASY_RUN_TYPES = ['easy', 'easy_strides', 'long_easy', 'recovery']

  const [
    { data: activities },
    { data: intervalRuns },
    { data: thresholdRuns },
    { data: longRuns },
    { data: easyRuns },
    { data: tokenData },
    goalsData,
    { data: membership },
    { data: userProfile },
  ] = await Promise.all([
    supabaseAdmin.from('activities').select('id,start_date,distance,moving_time,suffer_score,run_type,type,name,average_heartrate,average_speed,average_cadence,total_elevation_gain').eq('athlete_id', athleteId).eq('type', 'Run').order('start_date', { ascending: false }).limit(200),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['intervals', 'interval_5k', 'interval_10k']).order('start_date', { ascending: false }).limit(20),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['threshold', 'tempo']).order('start_date', { ascending: false }).limit(20),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', ['long', 'long_easy', 'long_progressive', 'long_steady']).order('start_date', { ascending: false }).limit(15),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', EASY_RUN_TYPES).order('start_date', { ascending: false }).limit(30),
    supabaseAdmin.from('strava_tokens').select('athlete_data').eq('athlete_id', athleteId).single(),
    supabaseAdmin.from('user_goals').select('*').eq('athlete_id', athleteId).order('race_date', { ascending: true }).then(r => r.data ?? []).catch(() => []),
    supabaseAdmin.from('group_members').select('group_id').eq('athlete_id', athleteId),
    supabaseAdmin.from('user_profiles').select('display_name, primary_group_id, max_hr, group_order').eq('athlete_id', athleteId).maybeSingle(),
  ])

  // Race query is separate — is_race column may not exist before migration_008
  let raceRuns: any[] = []
  try {
    const { data } = await supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('is_race', true).order('start_date', { ascending: false }).limit(10)
    raceRuns = data ?? []
  } catch { /* column doesn't exist yet — ignore */ }

  const maxHr = userProfile?.max_hr ?? undefined

  // Run all analyzers and combine estimates — wrapped in try-catch so
  // the dashboard still renders even if analysis code has an unexpected error
  let analysisResult: ReturnType<typeof analyzeAllAndCombine>
  try {
    analysisResult = analyzeAllAndCombine(
      intervalRuns ?? [],
      thresholdRuns ?? [],
      longRuns ?? [],
      easyRuns ?? [],
      raceRuns,
      maxHr ?? 195,
      activities ?? [],
    )
  } catch (err) {
    console.error('analyzeAllAndCombine failed:', err)
    analysisResult = {
      intervalEstimates: [], thresholdEstimates: [], longRunAnalyses: [],
      raceAnalyses: [], easyRunResults: [], easyTrendEstimates: [],
      allRaceEstimates: [],
      combined: { '5k': null, '10k': null, 'hm': null, 'fm': null },
    }
  }

  // ── Group data ────────────────────────────────────────────
  // Fetch data for all groups this athlete belongs to (up to 3)
  const allGroupsData = await (async () => {
    try {
      if (!membership?.length) return []

      // This week's Monday midnight in Jakarta (UTC+7)
      const nowUtc = Date.now()
      const jakartaOffset = 7 * 60 * 60 * 1000
      const nowJakarta = new Date(nowUtc + jakartaOffset)
      const dayOfWeek = nowJakarta.getUTCDay()
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const mondayJakarta = new Date(nowJakarta)
      mondayJakarta.setUTCDate(mondayJakarta.getUTCDate() - daysSinceMonday)
      mondayJakarta.setUTCHours(0, 0, 0, 0)
      const mondayUtc = new Date(mondayJakarta.getTime() - jakartaOffset)
      const weekStartIso = mondayUtc.toISOString()

      // Sort memberships by saved group_order, falling back to primary_group_id then insertion order
      const groupOrder: string[] = userProfile?.group_order ?? []
      const primaryGroupId = userProfile?.primary_group_id
      const sortedMemberships = [...(membership ?? [])].sort((a: any, b: any) => {
        const ai = groupOrder.length > 0 ? groupOrder.indexOf(a.group_id) : -1
        const bi = groupOrder.length > 0 ? groupOrder.indexOf(b.group_id) : -1
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1
          if (bi === -1) return -1
          return ai - bi
        }
        // Fallback: primary group first
        if (a.group_id === primaryGroupId) return -1
        if (b.group_id === primaryGroupId) return 1
        return 0
      })
      const groupIds = sortedMemberships.slice(0, 3).map((m: any) => m.group_id)

      const results = await Promise.all(groupIds.map(async (groupId: string) => {
        try {
          const [{ data: group }, { data: allMembers }] = await Promise.all([
            supabaseAdmin.from('groups').select('id, name').eq('id', groupId).single(),
            supabaseAdmin.from('group_members').select('athlete_id, role').eq('group_id', groupId),
          ])

          if (!group) return null

          const memberIds = (allMembers ?? []).map((m: any) => m.athlete_id)
          const otherMemberIds = memberIds.filter((id: number) => id !== athleteId)

          const [{ data: tokens }, { data: groupActivities }, { data: otherGoalsData }] = await Promise.all([
            supabaseAdmin.from('strava_tokens').select('athlete_id, athlete_name, athlete_profile').in('athlete_id', memberIds),
            supabaseAdmin.from('activities').select('id, athlete_id, name, start_date, distance, moving_time, average_speed, average_heartrate, run_type').in('athlete_id', memberIds).gte('start_date', weekStartIso).order('start_date', { ascending: false }).limit(50),
            otherMemberIds.length > 0
              ? supabaseAdmin.from('user_goals').select('*').in('athlete_id', otherMemberIds)
              : Promise.resolve({ data: [] }),
          ])

          const members = memberIds.map((aid: number) => {
            const token = tokens?.find((t: any) => t.athlete_id === aid)
            const memberRuns = (groupActivities ?? []).filter((a: any) => a.athlete_id === aid)

            const weekKm = memberRuns.reduce((s: number, a: any) => s + a.distance / 1000, 0)

            const runDates = new Set(
              memberRuns.map((a: any) => {
                const d = new Date(new Date(a.start_date).getTime() + 7 * 60 * 60 * 1000)
                return d.toISOString().split('T')[0]
              })
            )
            let streak = 0
            const today = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
            for (let i = 0; i < 7; i++) {
              const d = new Date(today)
              d.setDate(d.getDate() - i)
              if (runDates.has(d.toISOString().split('T')[0])) streak++
              else if (i > 0) break
            }

            const lastRun = memberRuns[0]
            const lastRunDaysAgo = lastRun
              ? Math.floor((Date.now() - new Date(lastRun.start_date).getTime()) / 86400000)
              : null

            return {
              athlete_id: aid,
              name: token?.athlete_name ?? `Athlete ${aid}`,
              profile_pic: token?.athlete_profile ?? null,
              weekKm: parseFloat(weekKm.toFixed(1)),
              streak,
              lastRunDaysAgo,
              is_me: aid === athleteId,
            }
          })

          const memberMap = Object.fromEntries(
            members.map((m: any) => [m.athlete_id, { name: m.name, profile_pic: m.profile_pic, is_me: m.is_me }])
          )

          const memberGoals = (otherGoalsData ?? []).map((g: any) => ({
            ...g,
            athlete_name: members.find((m: any) => m.athlete_id === g.athlete_id)?.name ?? 'Member',
            athlete_profile: members.find((m: any) => m.athlete_id === g.athlete_id)?.profile_pic ?? null,
          }))

          const myRole = allMembers?.find((m: any) => m.athlete_id === athleteId)?.role ?? 'member'
          return { group, members, memberMap, feedRuns: groupActivities ?? [], memberGoals, myRole }
        } catch {
          return null
        }
      }))

      return results.filter(Boolean)
    } catch {
      return []
    }
  })()

  // Build estimates map from combined results
  const estimates: Record<string, number | null> = {
    '5k': analysisResult.combined['5k']?.bestEstimateSecs ?? null,
    '10k': analysisResult.combined['10k']?.bestEstimateSecs ?? null,
    'hm': analysisResult.combined['hm']?.bestEstimateSecs ?? null,
    'fm': analysisResult.combined['fm']?.bestEstimateSecs ?? null,
  }

  // Confidence map for GoalCards
  const confidence: Record<string, number> = {}
  for (const dk of ['5k', '10k', 'hm', 'fm']) {
    const c = analysisResult.combined[dk as '5k' | '10k' | 'hm' | 'fm']
    if (c) confidence[dk] = c.confidence
  }

  // Source counts for tooltips
  const sourceCounts: Record<string, Record<string, number>> = {}
  for (const dk of ['5k', '10k', 'hm', 'fm']) {
    const c = analysisResult.combined[dk as '5k' | '10k' | 'hm' | 'fm']
    if (c) {
      const counts: Record<string, number> = {}
      for (const contrib of c.contributors) {
        counts[contrib.source] = (counts[contrib.source] ?? 0) + 1
      }
      sourceCounts[dk] = counts
    }
  }

  return {
    activities: activities ?? [],
    athlete: tokenData?.athlete_data,
    displayName: userProfile?.display_name ?? null,
    hasMaxHr: !!userProfile?.max_hr,
    goals: (goalsData ?? []) as UserGoal[],
    estimates,
    confidence,
    sourceCounts,
    allGroupsData,
  }
}

export default async function DashboardPage() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  if (!athleteId) {
    return <OnboardingPage />
  }

  const { activities, athlete, displayName, hasMaxHr, goals, estimates, confidence, sourceCounts, allGroupsData } = await getData(Number(athleteId))
  const trainingLoad = calculateTrainingLoad(activities)

  const thisWeek = isoWeek(new Date())
  const weekActivities = activities.filter((a: any) => isoWeek(new Date(a.start_date)) === thisWeek)
  const weekDist = weekActivities.reduce((s: number, a: any) => s + a.distance, 0)
  const weekTime = weekActivities.reduce((s: number, a: any) => s + a.moving_time, 0)
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearDist = activities.filter((a: any) => new Date(a.start_date) >= yearStart).reduce((s: number, a: any) => s + a.distance, 0)
  const recentRuns = activities.slice(0, 5)
  const unitLabel = distanceUnitLabel(unit)

  return (
    <>
      <Nav />
      <main className="standalone-main max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24">

        {/* Page header */}
        <div className="mb-6 fade-up">
          <h1 className="font-display font-extrabold uppercase leading-none" style={{ fontSize: 'clamp(28px, 6vw, 48px)', letterSpacing: '-0.02em' }}>
            Hey, {(displayName ?? athlete?.firstname ?? 'Runner').split(' ')[0]} 👋
          </h1>
          <p className="font-mono text-xs mt-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {format(new Date(), 'EEE, MMM d')} · {activities.length} runs tracked
          </p>
        </div>

        {/* ── Bento Row 1: Weekly chart + mini stats ── */}
        <div className="grid grid-cols-12 gap-3 mb-3">

          {/* Weekly Mileage — hero chart card */}
          <div className="col-span-12 md:col-span-7 card glow-orange fade-up" style={{ padding: '1.25rem' }}>
            <div className="flex items-start justify-between mb-1">
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Weekly Distance</p>
            </div>
            <div className="stat-num font-bold leading-none text-white mb-4" style={{ fontSize: 'clamp(32px, 5vw, 44px)' }}>
              {formatDistanceShort(weekDist, unit).split(' ')[0]}
              <span className="font-normal ml-1.5" style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{unitLabel}</span>
            </div>
            <div style={{ height: 160 }}>
              <WeeklyMileageChart activities={activities} />
            </div>
          </div>

          {/* Mini stats — 2×2 */}
          <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-3">
            {[
              { label: 'Week runs',  value: `${weekActivities.length}`, unit: 'runs' },
              { label: 'Week time',  value: weekTime > 0 ? formatDuration(weekTime) : '--', unit: '' },
              { label: 'This year',  value: formatDistanceShort(yearDist, unit).split(' ')[0], unit: unitLabel },
              { label: 'Activities', value: `${activities.filter((a: any) => new Date(a.start_date) >= yearStart).length}`, unit: 'this yr' },
            ].map((s, i) => (
              <div key={i} className="card fade-up" style={{ animationDelay: `${60 + i * 50}ms`, padding: '0.875rem 1rem' }}>
                <p className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                <div className="stat-num text-2xl font-bold leading-none text-white">
                  {s.value}
                  {s.unit && <span className="font-normal ml-1" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bento Row 2: Training Load + Race Estimates ── */}
        {(trainingLoad.length > 0 || Object.values(estimates).some(v => v != null)) && (
          <div className="grid grid-cols-12 gap-3 mb-6">

            {trainingLoad.length > 0 && (
              <div className="col-span-12 md:col-span-5 card fade-up" style={{ padding: '1.25rem' }}>
                <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Training Load</p>
                <div style={{ height: 160 }}>
                  <TrainingLoadChart data={trainingLoad} days={90} />
                </div>
              </div>
            )}

            {Object.values(estimates).some(v => v != null) && (
              <div className={`col-span-12 card fade-up${trainingLoad.length > 0 ? ' md:col-span-7' : ''}`} style={{ padding: '1.25rem' }}>
                <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Race Estimates</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { key: '5k',  label: '5K' },
                    { key: '10k', label: '10K' },
                    { key: 'hm',  label: 'Half' },
                    { key: 'fm',  label: 'Full' },
                  ] as const).map(({ key, label }) => (
                    <div key={key} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.875rem' }}>
                      <p className="font-mono text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                      <p className="stat-num text-xl font-bold leading-none" style={{ color: estimates[key] ? '#f0f0f0' : 'var(--text-muted)' }}>
                        {estimates[key] ? formatDuration(estimates[key]!) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Group Stats ── */}
        {allGroupsData.length > 0 ? (
          allGroupsData.map((groupData: any) => (
            <div key={groupData.group.id} className="mb-6">
              <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-3">
                {groupData.group.name}
              </h2>
              <div className="mb-3">
                <GroupCoachTab groupId={groupData.group.id} myRole={groupData.myRole} members={groupData.members} />
              </div>
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <GroupLeaderboard members={groupData.members} groupId={groupData.group.id} groupName={groupData.group.name} unit={unit} />
                <GroupFeed runs={groupData.feedRuns} memberMap={groupData.memberMap} myAthleteId={Number(athleteId)} groupId={groupData.group.id} unit={unit} />
              </div>
              {groupData.memberGoals.length > 0 && (
                <div>
                  <h2 className="font-display font-bold text-base text-[#6b7280] uppercase tracking-widest mb-3">
                    {groupData.group.name} Race Goals
                  </h2>
                  <GroupGoalsSection memberGoals={groupData.memberGoals} />
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="card fade-up mb-6 flex flex-col items-center justify-center text-center gap-4" style={{ paddingTop: 40, paddingBottom: 40 }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-muted)' }}>
              <span className="text-2xl">🏃</span>
            </div>
            <div>
              <p className="font-bold text-white mb-1">You&apos;re not in a group yet</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Create a group and invite your training partners to run together.</p>
            </div>
            <Link
              href="/groups"
              className="flex items-center gap-2 text-white font-bold px-5 py-2.5 rounded-lg transition-colors text-sm"
              style={{ background: 'var(--orange)' }}
              prefetch
            >
              Create a group
            </Link>
          </div>
        )}

        {/* ── My Race Goals ── */}
        <div className="mb-8">
          {!hasMaxHr && Object.values(estimates).some(v => v != null) && (
            <div className="flex items-center gap-2 rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.20)' }}>
              <span style={{ color: 'var(--orange)', flexShrink: 0 }}>⚠</span>
              <span style={{ color: 'var(--text-2)' }}>Race projections use a default max HR of 195 bpm — open <span className="text-white font-medium">Settings</span> (gear icon) to add your actual max HR for more accurate estimates.</span>
            </div>
          )}
          <GoalsSection
            initialGoals={goals}
            estimates={Object.fromEntries(
              Object.entries(estimates).filter(([, v]) => v != null)
            ) as Record<string, number>}
            confidence={confidence}
            sourceCounts={sourceCounts}
            unit={unit}
          />
        </div>


      </main>
    </>
  )
}
