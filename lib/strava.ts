import { supabaseAdmin } from './supabase'
import {
  categorizeRun,
  detectRace,
  raceFieldsForRunType,
  resolvePersistedRunType,
  type PaceZones,
} from './run-classification'
import { buildTrainingPaceZones, type PaceProfileActivity } from './pace-profile'

const STRAVA_API = 'https://www.strava.com/api/v3'

// ─── Token management ────────────────────────────────────────────────────────

export async function getValidToken(athleteId: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('strava_tokens')
    .select('*')
    .eq('athlete_id', athleteId)
    .single()

  if (!data) return null

  if (data.expires_at < Date.now() / 1000 + 300) {
    return await refreshToken(data.refresh_token, athleteId)
  }

  return data.access_token
}

async function refreshToken(refreshToken: string, athleteId: number): Promise<string | null> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()

  await supabaseAdmin.from('strava_tokens').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    updated_at: new Date().toISOString(),
  }).eq('athlete_id', athleteId)

  return data.access_token
}

// ─── Activity fetching ────────────────────────────────────────────────────────

export async function fetchActivities(token: string, page = 1, perPage = 100) {
  const res = await fetch(
    `${STRAVA_API}/athlete/activities?per_page=${perPage}&page=${page}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch activities')
  return res.json()
}

export async function fetchActivityDetail(token: string, activityId: number) {
  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch activity ${activityId}`)
  return res.json()
}

export async function fetchActivityStreams(token: string, activityId: number) {
  const res = await fetch(
    `${STRAVA_API}/activities/${activityId}/streams?keys=heartrate,time&key_by_type=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return null
  return res.json()
}

export async function fetchAthlete(token: string) {
  const res = await fetch(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch athlete')
  return res.json()
}

// ─── Pace zones ──────────────────────────────────────────────────────────────

const PACE_PROFILE_LOOKBACK_DAYS = 90
const PACE_PROFILE_CACHE_HOURS = 24

async function fetchRecentTrainingActivities(athleteId: number): Promise<PaceProfileActivity[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PACE_PROFILE_LOOKBACK_DAYS)
  const { data } = await supabaseAdmin
    .from('activities')
    .select('id, name, type, start_date, distance, moving_time, average_speed, average_heartrate, total_elevation_gain, run_type, run_type_manual, is_race, excluded_from_analysis, laps, splits, raw')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .gte('start_date', cutoff.toISOString())
    .order('start_date', { ascending: false })
    .limit(200)

  return (data ?? []) as PaceProfileActivity[]
}

async function latestRunSyncedAfter(athleteId: number, updatedAt?: string | null) {
  if (!updatedAt) return true
  const { data } = await supabaseAdmin
    .from('activities')
    .select('created_at')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .gt('created_at', updatedAt)
    .order('created_at', { ascending: false })
    .limit(1)
  return Boolean(data?.length)
}

export async function refreshUserPaceProfile(athleteId: number, maxHr?: number): Promise<PaceZones | null> {
  const activities = await fetchRecentTrainingActivities(athleteId)
  const { zones } = buildTrainingPaceZones(activities, { maxHr })
  if (zones) {
    await supabaseAdmin
      .from('user_profiles')
      .update({ pace_zones: zones, pace_zones_updated_at: new Date().toISOString() })
      .eq('athlete_id', athleteId)
  }
  return zones
}

export async function buildUserPaceProfile(athleteId: number, maxHr?: number): Promise<PaceZones | null> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('pace_zones, pace_zones_updated_at')
    .eq('athlete_id', athleteId)
    .single()

  const updatedAt = profile?.pace_zones_updated_at
  const ageDays = updatedAt
    ? (Date.now() - new Date(updatedAt).getTime()) / 86400000
    : Infinity
  const ageHours = ageDays * 24

  if (ageHours < PACE_PROFILE_CACHE_HOURS && profile?.pace_zones && !(await latestRunSyncedAfter(athleteId, updatedAt))) {
    return profile.pace_zones as PaceZones
  }

  return await refreshUserPaceProfile(athleteId, maxHr)
}

async function recategorizeRecentAutomaticRuns(athleteId: number, zones: PaceZones, maxHr?: number) {
  const activities = await fetchRecentTrainingActivities(athleteId)
  let updated = 0

  for (const activity of activities) {
    if (activity.run_type_manual === true) continue
    if (activity.is_race || activity.run_type === 'race' || activity.run_type === 'treadmill') continue
    if (!activity.average_speed || !activity.distance) continue

    const nextType = categorizeRun({
      distance: activity.distance,
      average_speed: activity.average_speed,
      average_heartrate: activity.average_heartrate ?? undefined,
      laps: (activity.laps ?? []) as any[],
      splits: (activity.splits ?? []) as any[],
    }, zones, maxHr)

    if (nextType === activity.run_type && activity.run_type_manual === false) continue

    const { error } = await supabaseAdmin
      .from('activities')
      .update({ run_type: nextType, run_type_manual: false })
      .eq('id', activity.id)

    if (error) throw error
    updated++
  }

  return updated
}

// ─── Run categorization ───────────────────────────────────────────────────────

// ─── Lap detail sync ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function syncActivityDetails(athleteId: number, limit = 50) {
  const token = await getValidToken(athleteId)
  if (!token) throw new Error('No valid token')

  // Build pace zones and fetch max_hr once for all runs in this batch
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('max_hr')
    .eq('athlete_id', athleteId)
    .single()
  const maxHr = profile?.max_hr ?? undefined
  const zones = await buildUserPaceProfile(athleteId, maxHr)

  // Fetch runs that are either not yet detail-synced OR missing stream data
  const { data: unsynced } = await supabaseAdmin
    .from('activities')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('detail_synced', false)
    .order('start_date', { ascending: false })
    .limit(limit)

  const { data: missingStreams } = await supabaseAdmin
    .from('activities')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('detail_synced', true)
    .is('streams', null)
    .order('start_date', { ascending: false })
    .limit(limit)

  // Deduplicate
  const seen = new Set<number>()
  const activities = [...(unsynced ?? []), ...(missingStreams ?? [])].filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  }).slice(0, limit)

  if (!activities?.length) return 0

  let synced = 0

  for (const act of activities) {
    try {
      const detail = await fetchActivityDetail(token, act.id)
      const streams = await fetchActivityStreams(token, act.id)
      const laps = detail.laps ?? []
      const runType = categorizeRun({
        distance: detail.distance,
        average_speed: detail.average_speed,
        average_heartrate: detail.average_heartrate,
        suffer_score: detail.suffer_score,
        splits: detail.splits_metric,
        laps,
      }, zones ?? undefined, maxHr)

      const isTreadmill = detail.trainer === true
      const raceDetection = detectRace({
        name: detail.name,
        distance: detail.distance,
        workout_type: detail.workout_type,
      })
      // Fetch current run_type so we don't overwrite manual tags
      const { data: existing } = await supabaseAdmin
        .from('activities')
        .select('run_type, run_type_manual')
        .eq('id', act.id)
        .single()
      const currentType = existing?.run_type
      const isManual = existing?.run_type_manual === true
      const newRunType = resolvePersistedRunType({
        automaticRunType: runType,
        currentRunType: currentType,
        isManual,
        isTreadmill,
        raceDetection,
      })
      const raceFields = raceFieldsForRunType(newRunType, raceDetection)

      await supabaseAdmin
        .from('activities')
        .update({
          laps,
          run_type: newRunType,
          ...(!isManual ? { run_type_manual: false } : {}),
          splits: detail.splits_metric ?? null,
          streams: streams ?? null,
          detail_synced: true,
          ...raceFields,
        })
        .eq('id', act.id)

      synced++
      await sleep(1100)
    } catch (err) {
      console.error(`Failed to sync detail for activity ${act.id}:`, err)
    }
  }

  if (synced > 0) {
    const refreshedZones = await refreshUserPaceProfile(athleteId, maxHr)
    if (refreshedZones) await recategorizeRecentAutomaticRuns(athleteId, refreshedZones, maxHr)
  }

  return synced
}

// ─── Training Load (ATL/CTL/TSB) ─────────────────────────────────────────────

export interface TrainingLoadPoint {
  date: string
  atl: number
  ctl: number
  tsb: number
  load: number
}

export function calculateTrainingLoad(
  activities: { start_date: string; suffer_score?: number; distance: number; moving_time: number }[]
): TrainingLoadPoint[] {
  if (!activities.length) return []

  const dailyLoad: Record<string, number> = {}
  for (const a of activities) {
    const date = a.start_date.split('T')[0]
    const load = a.suffer_score && a.suffer_score > 0
      ? a.suffer_score
      : Math.round((a.moving_time / 60) * 0.8)
    dailyLoad[date] = (dailyLoad[date] ?? 0) + load
  }

  const dates = Object.keys(dailyLoad).sort()
  if (!dates.length) return []

  const start = new Date(dates[0])
  const end = new Date()
  const allDates: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().split('T')[0])
  }

  const ATL_DECAY = 1 / 7
  const CTL_DECAY = 1 / 42
  let atl = 0
  let ctl = 0
  const result: TrainingLoadPoint[] = []

  for (const date of allDates) {
    const load = dailyLoad[date] ?? 0
    atl = atl + ATL_DECAY * (load - atl)
    ctl = ctl + CTL_DECAY * (load - ctl)
    result.push({
      date,
      atl: parseFloat(atl.toFixed(1)),
      ctl: parseFloat(ctl.toFixed(1)),
      tsb: parseFloat((ctl - atl).toFixed(1)),
      load,
    })
  }

  return result
}

// ─── Main sync ────────────────────────────────────────────────────────────────

export async function syncActivities(athleteId: number, accessToken?: string) {
  const token = accessToken ?? await getValidToken(athleteId)
  if (!token) throw new Error('No valid token')
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('max_hr')
    .eq('athlete_id', athleteId)
    .maybeSingle()
  const maxHr = profile?.max_hr ?? undefined
  const zones = await buildUserPaceProfile(athleteId, maxHr)

  let page = 1
  let totalSynced = 0

  // Get the most recent activity ID already in the DB so we can stop early
  const { data: latestStored } = await supabaseAdmin
    .from('activities')
    .select('id')
    .eq('athlete_id', athleteId)
    .order('start_date', { ascending: false })
    .limit(1)
  const latestStoredId = latestStored?.[0]?.id ?? null

  while (true) {
    const activities = await fetchActivities(token, page)
    if (!activities.length) break

    // Stop if we've hit activities we already have
    const hasKnown = latestStoredId && activities.some((a: any) => a.id === latestStoredId)

    const runs = activities
      .filter((a: any) => a.type === 'Run' || a.sport_type === 'Run')
      .map((a: any) => {
        const isTreadmill = a.trainer === true
        const raceDetection = detectRace({
          name: a.name,
          distance: a.distance,
          workout_type: a.workout_type,
        })
        const automaticRunType = categorizeRun({
              distance: a.distance,
              average_speed: a.average_speed,
              average_heartrate: a.average_heartrate,
              splits: a.splits_metric ?? [],
              laps: a.laps ?? [],
            }, zones ?? undefined, maxHr)
        const runType = resolvePersistedRunType({
          automaticRunType,
          isTreadmill,
          raceDetection,
        })
        const raceFields = raceFieldsForRunType(runType, raceDetection)

        return {
          id: a.id,
          athlete_id: athleteId,
          name: a.name,
          type: a.type || a.sport_type,
          start_date: a.start_date,
          distance: a.distance,
          moving_time: a.moving_time,
          elapsed_time: a.elapsed_time,
          total_elevation_gain: a.total_elevation_gain,
          average_speed: a.average_speed,
          max_speed: a.max_speed,
          average_heartrate: a.average_heartrate ?? null,
          max_heartrate: a.max_heartrate ?? null,
          average_cadence: a.average_cadence ?? null,
          suffer_score: a.suffer_score ?? null,
          splits: a.splits_metric ?? null,
          run_type: runType,
          run_type_manual: false,
          ...raceFields,
          detail_synced: false,
          raw: a,
        }
      })

    if (runs.length > 0) {
      // Check which IDs are genuinely new before counting
      const runIds = runs.map((r: any) => r.id)
      const { data: existing } = await supabaseAdmin
        .from('activities')
        .select('id')
        .in('id', runIds)
      const existingIds = new Set((existing ?? []).map((r: any) => r.id))
      const newCount = runs.filter((r: any) => !existingIds.has(r.id)).length

      // Only insert truly new runs — never overwrite existing rows so manual
      // run_type tags and excluded_from_analysis flags are preserved.
      await supabaseAdmin.from('activities').upsert(runs, {
        onConflict: 'id',
        ignoreDuplicates: true,
      })
      totalSynced += newCount
    }

    if (hasKnown || activities.length < 100) break
    page++
  }

  if (totalSynced > 0) {
    const refreshedZones = await refreshUserPaceProfile(athleteId, maxHr)
    if (refreshedZones) await recategorizeRecentAutomaticRuns(athleteId, refreshedZones, maxHr)
  }

  return totalSynced
}
