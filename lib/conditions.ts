import { supabaseAdmin } from './supabase'

const OPEN_METEO_URL = 'https://archive-api.open-meteo.com/v1/archive'

interface OpenMeteoHourly {
  time: string[]
  temperature_2m: (number | null)[]
  relative_humidity_2m: (number | null)[]
  dew_point_2m: (number | null)[]
  wind_speed_10m: (number | null)[]
}

interface OpenMeteoResponse {
  hourly?: OpenMeteoHourly
}

export type ConditionsSource = 'open_meteo' | 'strava_device' | 'manual' | 'unknown'

export interface AmbientConditions {
  source: ConditionsSource
  tempC: number | null
  humidityPct: number | null
  dewpointC: number | null
  windKph: number | null
  wbgtApproxC: number | null
  fetchError?: string
}

// Stull (2011) wet-bulb temperature from dry-bulb T (°C) and RH (%).
// Valid for T in [-20, 50] °C and RH in [5, 99] %.
function wetBulbStull(tempC: number, rhPct: number): number {
  const T = tempC
  const RH = Math.max(5, Math.min(99, rhPct))
  return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659))
    + Math.atan(T + RH)
    - Math.atan(RH - 1.676331)
    + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH)
    - 4.686035
}

// Shaded WBGT approximation: 0.7 × Tw + 0.3 × Tdry. Omits the globe (radiative)
// term; we can refine by pulling shortwave_radiation from Open-Meteo later.
function wbgtApprox(tempC: number, rhPct: number): number {
  return 0.7 * wetBulbStull(tempC, rhPct) + 0.3 * tempC
}

async function fetchOpenMeteo(lat: number, lon: number, startISO: string, durationSecs: number): Promise<AmbientConditions> {
  const start = new Date(startISO)
  const end = new Date(start.getTime() + durationSecs * 1000)
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m',
    timezone: 'UTC',
  })

  const empty = (err: string): AmbientConditions => ({
    source: 'unknown', tempC: null, humidityPct: null, dewpointC: null,
    windKph: null, wbgtApproxC: null, fetchError: err,
  })

  let res: Response
  try {
    res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, { cache: 'no-store' })
  } catch (e: any) {
    return empty(`open-meteo: ${e?.message ?? 'fetch failed'}`)
  }
  if (!res.ok) return empty(`open-meteo: HTTP ${res.status}`)
  const data = await res.json().catch(() => null) as OpenMeteoResponse | null
  const h = data?.hourly
  if (!h?.time?.length) return empty('open-meteo: empty hourly')

  // Average across hours overlapping the run window. Each hour entry represents
  // the conditions at the START of that hour; treat the bucket as [t, t+1h).
  const startMs = start.getTime()
  const endMs = end.getTime()
  let tSum = 0, rhSum = 0, dpSum = 0, wSum = 0, n = 0, dpN = 0, wN = 0
  for (let i = 0; i < h.time.length; i++) {
    const hourMs = Date.parse(h.time[i] + 'Z')
    if (hourMs + 3_600_000 <= startMs) continue
    if (hourMs >= endMs) break
    const T = h.temperature_2m[i]
    const RH = h.relative_humidity_2m[i]
    if (T == null || RH == null) continue
    tSum += T; rhSum += RH; n++
    const DP = h.dew_point_2m[i]
    if (DP != null) { dpSum += DP; dpN++ }
    const W = h.wind_speed_10m[i]
    if (W != null) { wSum += W; wN++ }
  }
  if (n === 0) return empty('open-meteo: no overlap')

  const tempC = tSum / n
  const humidityPct = rhSum / n
  return {
    source: 'open_meteo',
    tempC,
    humidityPct,
    dewpointC: dpN > 0 ? dpSum / dpN : null,
    windKph: wN > 0 ? (wSum / wN) * 3.6 : null,
    wbgtApproxC: wbgtApprox(tempC, humidityPct),
  }
}

export interface ConditionsInput {
  activityId: number
  athleteId: number
  startDateISO: string
  durationSecs: number
  startLatLng?: [number, number] | null
  stravaAverageTempC?: number | null
}

/**
 * Resolve ambient conditions for an activity and upsert activity_conditions.
 * Open-Meteo is the canonical ambient source; Strava's device-reported
 * average_temp is a fallback when GPS is missing (treadmill, no-GPS runs).
 * On total failure we still write a row so we don't retry indefinitely.
 */
export async function fetchAndStoreConditions(input: ConditionsInput): Promise<AmbientConditions> {
  const { activityId, athleteId, startDateISO, durationSecs, startLatLng, stravaAverageTempC } = input

  let conditions: AmbientConditions
  const hasGPS = startLatLng && startLatLng.length === 2 && startLatLng[0] != null && startLatLng[1] != null

  if (hasGPS) {
    conditions = await fetchOpenMeteo(startLatLng![0], startLatLng![1], startDateISO, durationSecs)
    // If Open-Meteo failed and we have a device temp, downgrade to that rather than 'unknown'.
    if (conditions.source === 'unknown' && stravaAverageTempC != null) {
      conditions = {
        source: 'strava_device',
        tempC: stravaAverageTempC,
        humidityPct: null, dewpointC: null, windKph: null, wbgtApproxC: null,
        fetchError: conditions.fetchError,
      }
    }
  } else if (stravaAverageTempC != null) {
    conditions = {
      source: 'strava_device',
      tempC: stravaAverageTempC,
      humidityPct: null, dewpointC: null, windKph: null, wbgtApproxC: null,
    }
  } else {
    conditions = {
      source: 'unknown', tempC: null, humidityPct: null, dewpointC: null,
      windKph: null, wbgtApproxC: null,
      fetchError: 'no GPS coords and no device temp',
    }
  }

  await supabaseAdmin.from('activity_conditions').upsert({
    activity_id: activityId,
    athlete_id: athleteId,
    source: conditions.source,
    temp_c: conditions.tempC,
    humidity_pct: conditions.humidityPct,
    dewpoint_c: conditions.dewpointC,
    wind_kph: conditions.windKph,
    wbgt_approx_c: conditions.wbgtApproxC,
    fetched_at: new Date().toISOString(),
    fetch_error: conditions.fetchError ?? null,
  }, { onConflict: 'activity_id' })

  return conditions
}
