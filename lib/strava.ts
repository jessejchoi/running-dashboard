import { supabaseAdmin } from './supabase'

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

export interface PaceZones {
  intervalMaxPace: number    // sec/km — at or below = interval effort
  thresholdMaxPace: number   // sec/km
  tempoMaxPace: number       // sec/km
  easyMaxPace: number        // sec/km — above = recovery
  longRunThresholdKm: number // distance at or above = long run
  source: 'race_result' | 'user_goal'
}

const DIST_KM: Record<string, number> = { '5k': 5, '10k': 10, 'hm': 21.097, 'fm': 42.195 }
const DIST_PRIORITY = ['5k', '10k', 'hm', 'fm']

function isoWeekKey(d: Date): string {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${utc.getUTCFullYear()}-W${week}`
}

async function computePaceZones(athleteId: number): Promise<PaceZones | null> {
  let anchorPace5k: number | null = null
  let source: PaceZones['source'] = 'race_result'

  // 1. Try actual race results (prefer shortest distance = most accurate predictor)
  const { data: races } = await supabaseAdmin
    .from('activities')
    .select('matched_distance_key, moving_time')
    .eq('athlete_id', athleteId)
    .eq('is_race', true)
    .not('matched_distance_key', 'is', null)
    .order('start_date', { ascending: false })

  if (races?.length) {
    for (const dk of DIST_PRIORITY) {
      const race = races.find(r => r.matched_distance_key === dk)
      if (race?.moving_time) {
        const t5k = race.moving_time * Math.pow(5 / DIST_KM[dk], 1.06)
        anchorPace5k = t5k / 5
        break
      }
    }
  }

  // 2. Fall back to user-provided goal times
  if (anchorPace5k === null) {
    const { data: goals } = await supabaseAdmin
      .from('user_goals')
      .select('distance_key, current_secs')
      .eq('athlete_id', athleteId)
      .not('current_secs', 'is', null)

    if (goals?.length) {
      source = 'user_goal'
      for (const dk of DIST_PRIORITY) {
        const goal = goals.find(g => g.distance_key === dk && g.current_secs)
        if (goal) {
          const t5k = goal.current_secs * Math.pow(5 / DIST_KM[dk], 1.06)
          anchorPace5k = t5k / 5
          break
        }
      }
    }
  }

  if (anchorPace5k === null) return null

  // Zone boundaries as multipliers of 5K pace
  const p = anchorPace5k
  const paceZones = {
    intervalMaxPace:   p * 1.05,
    thresholdMaxPace:  p * 1.13,
    tempoMaxPace:      p * 1.25,
    easyMaxPace:       p * 1.50,
    source,
  }

  // Long run threshold: 80% of median weekly long run over last 12 weeks
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 84)
  const { data: recentRuns } = await supabaseAdmin
    .from('activities')
    .select('start_date, distance')
    .eq('athlete_id', athleteId)
    .gte('start_date', cutoff.toISOString())
    .gt('distance', 0)

  let longRunThresholdKm = 12

  if (recentRuns && recentRuns.length >= 4) {
    const weeklyMax: Record<string, number> = {}
    for (const run of recentRuns) {
      const key = isoWeekKey(new Date(run.start_date))
      const km = run.distance / 1000
      if (!weeklyMax[key] || km > weeklyMax[key]) weeklyMax[key] = km
    }
    const sorted = Object.values(weeklyMax).sort((a, b) => a - b)
    if (sorted.length >= 4) {
      const median = sorted[Math.floor(sorted.length / 2)]
      longRunThresholdKm = Math.max(8, Math.min(30, median * 0.80))
    }
  }

  return { ...paceZones, longRunThresholdKm }
}

export async function buildUserPaceProfile(athleteId: number): Promise<PaceZones | null> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('pace_zones, pace_zones_updated_at')
    .eq('athlete_id', athleteId)
    .single()

  const updatedAt = profile?.pace_zones_updated_at
  const ageDays = updatedAt
    ? (Date.now() - new Date(updatedAt).getTime()) / 86400000
    : Infinity

  if (ageDays < 14 && profile?.pace_zones) {
    return profile.pace_zones as PaceZones
  }

  const zones = await computePaceZones(athleteId)
  if (zones) {
    await supabaseAdmin
      .from('user_profiles')
      .update({ pace_zones: zones, pace_zones_updated_at: new Date().toISOString() })
      .eq('athlete_id', athleteId)
  }
  return zones
}

// ─── Run categorization ───────────────────────────────────────────────────────

function progressiveCheck(splits: any[]): 'long_progressive' | 'long_easy' {
  const third = Math.floor(splits.length / 3)
  if (third >= 2) {
    const avgPace = (arr: any[]) => {
      const ps = arr
        .map((s: any) => s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : null)
        .filter((p): p is number => p !== null && p > 0 && p < 600)
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0
    }
    const first = avgPace(splits.slice(0, third))
    const last  = avgPace(splits.slice(splits.length - third))
    if (first > 0 && last > 0 && (first - last) / first > 0.07) return 'long_progressive'
  }
  return 'long_easy'
}

export function categorizeRun(
  activity: {
    distance: number
    average_speed: number
    average_heartrate?: number
    suffer_score?: number
    splits?: any[]
    laps?: any[]
  },
  zones?: PaceZones,
  maxHr?: number
): string {
  const distanceKm = activity.distance / 1000
  const avgPaceSeconds = activity.average_speed ? 1000 / activity.average_speed : 999
  const hr = activity.average_heartrate ?? 0
  const splits = activity.laps ?? activity.splits ?? []

  // Pace coefficient of variation
  let paceCV = 0
  if (splits.length >= 3) {
    const paces = splits
      .map((s: any) => s.moving_time && s.distance ? s.moving_time / (s.distance / 1000) : null)
      .filter((p: any) => p !== null && p > 0 && p < 600) as number[]
    if (paces.length >= 3) {
      const mean = paces.reduce((a, b) => a + b, 0) / paces.length
      const variance = paces.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / paces.length
      paceCV = Math.sqrt(variance) / mean
    }
  }

  const maxSplitSpeed = splits.length > 0
    ? Math.max(...splits.map((s: any) => s.average_speed ?? 0))
    : activity.average_speed
  const maxSplitPace = maxSplitSpeed > 0 ? 1000 / maxSplitSpeed : 999

  // ── No zones: fall back to original hardcoded logic ──────────────────────────
  if (!zones) {
    if (paceCV > 0.12 || (maxSplitPace < 230 && distanceKm < 18)) return 'intervals'
    if (distanceKm >= 12) return progressiveCheck(splits)
    if (avgPaceSeconds < 290 && avgPaceSeconds > 230 && paceCV < 0.08) return 'threshold'
    if (avgPaceSeconds < 340 && avgPaceSeconds > 270 && paceCV < 0.08) return 'tempo'
    if (avgPaceSeconds > 380 || (hr > 0 && hr < 135)) return 'recovery'
    return 'easy'
  }

  // ── With zones: relative thresholds ─────────────────────────────────────────
  const { intervalMaxPace, thresholdMaxPace, tempoMaxPace, easyMaxPace, longRunThresholdKm } = zones

  // Strides: very short (<30s) fast bursts within a run
  const shortBursts = splits.filter((s: any) =>
    s.moving_time > 0 && s.moving_time < 30 &&
    s.average_speed > 0 && (1000 / s.average_speed) <= intervalMaxPace
  ).length

  // 1. Long run (user-adaptive distance threshold)
  if (distanceKm >= longRunThresholdKm) return progressiveCheck(splits)

  // 2. Intervals: high variability AND at least one split at interval pace
  if (paceCV > 0.12 && maxSplitPace <= intervalMaxPace) return 'intervals'

  // 3. Threshold: fastest split reaches threshold zone (no paceCV restriction —
  //    threshold workouts with walk rests have high CV but the fast reps reveal effort)
  if (maxSplitPace <= thresholdMaxPace) return 'threshold'

  // 4. Tempo
  if (maxSplitPace <= tempoMaxPace) return 'tempo'

  // 5. Easy + strides: overall easy pace but contains short fast bursts
  if (avgPaceSeconds > tempoMaxPace && shortBursts >= 2) return 'easy_strides'

  // 6. Recovery: slow overall pace OR low relative HR
  if (avgPaceSeconds > easyMaxPace) return 'recovery'
  if (maxHr && hr > 0 && hr < maxHr * 0.70) return 'recovery'

  return 'easy'
}

// ─── Lap detail sync ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function syncActivityDetails(athleteId: number, limit = 50) {
  const token = await getValidToken(athleteId)
  if (!token) throw new Error('No valid token')

  // Build pace zones and fetch max_hr once for all runs in this batch
  const [zones, profileRes] = await Promise.all([
    buildUserPaceProfile(athleteId),
    supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', athleteId).single(),
  ])
  const maxHr = profileRes.data?.max_hr ?? undefined

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
      // Fetch current run_type so we don't overwrite manual tags
      const { data: existing } = await supabaseAdmin
        .from('activities')
        .select('run_type')
        .eq('id', act.id)
        .single()
      const currentType = existing?.run_type
      // Only auto-set run_type if not yet manually tagged (null or auto-default)
      const autoTypes = [null, undefined, 'unknown', 'easy', 'recovery']
      const isAutoAssigning = isTreadmill || autoTypes.includes(currentType)
      const newRunType = isTreadmill
        ? 'treadmill'
        : autoTypes.includes(currentType) ? runType : currentType

      // Race detection: Strava workout_type 1 = Race, or name pattern
      const RACE_NAME_PATTERN = /\b(race|parkrun|marathon|5k|10k|hm|half.?marathon)\b/i
      const isRace = detail.workout_type === 1 || RACE_NAME_PATTERN.test(detail.name ?? '')

      // Match to nearest standard distance (±10% tolerance)
      let matchedDistanceKey: string | null = null
      if (isRace) {
        const distKm = detail.distance / 1000
        const standards = [
          { key: '5k', km: 5 },
          { key: '10k', km: 10 },
          { key: 'hm', km: 21.097 },
          { key: 'fm', km: 42.195 },
        ]
        for (const std of standards) {
          if (Math.abs(distKm - std.km) / std.km <= 0.10) {
            matchedDistanceKey = std.key
            break
          }
        }
      }

      await supabaseAdmin
        .from('activities')
        .update({
          laps,
          run_type: newRunType,
          ...(isAutoAssigning ? { run_type_manual: false } : {}),
          splits: detail.splits_metric ?? null,
          streams: streams ?? null,
          detail_synced: true,
          is_race: isRace,
          matched_distance_key: matchedDistanceKey,
        })
        .eq('id', act.id)

      synced++
      await sleep(1100)
    } catch (err) {
      console.error(`Failed to sync detail for activity ${act.id}:`, err)
    }
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
      .map((a: any) => ({
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
        detail_synced: false,
        raw: a,
      }))

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

  return totalSynced
}
