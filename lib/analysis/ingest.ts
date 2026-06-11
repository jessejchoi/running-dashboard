import { extractBestEfforts, storeBestEfforts } from './bestEfforts'
import { fetchAndStoreConditions } from '../conditions'

export interface IngestFeaturesInput {
  athleteId: number
  activityId: number
  startDateISO: string
  durationSecs: number
  startLatLng?: [number, number] | null
  stravaAverageTempC?: number | null
  streams: any
}

/**
 * Populate the analysis caches for a single activity:
 *   - activity_best_efforts: max-mean pace curve from streams
 *   - activity_conditions:   ambient temp/humidity/WBGT from Open-Meteo
 *
 * Each step is isolated — best-efforts is pure (no network) and conditions is
 * one HTTP call. Failures are logged but do not propagate; the broader Strava
 * sync should not break because Open-Meteo is down or streams are malformed.
 */
export async function ingestActivityFeatures(input: IngestFeaturesInput): Promise<void> {
  try {
    const efforts = extractBestEfforts(input.streams)
    await storeBestEfforts({
      activityId: input.activityId,
      athleteId: input.athleteId,
      startDateISO: input.startDateISO,
      efforts,
    })
  } catch (e) {
    console.error(`[ingestFeatures] best efforts failed for ${input.activityId}:`, e)
  }

  try {
    await fetchAndStoreConditions({
      activityId: input.activityId,
      athleteId: input.athleteId,
      startDateISO: input.startDateISO,
      durationSecs: input.durationSecs,
      startLatLng: input.startLatLng,
      stravaAverageTempC: input.stravaAverageTempC,
    })
  } catch (e) {
    console.error(`[ingestFeatures] conditions failed for ${input.activityId}:`, e)
  }
}
