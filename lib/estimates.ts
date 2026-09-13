import { supabaseAdmin } from '@/lib/supabase'
import { getAthleteAnalysis } from '@/lib/analysis/service'
import {
  activeModelVersion,
  expectedEstimatorEnabled,
  type ExpectedEstimate,
} from '@/lib/analysis/expected'
import { getExpectedEstimates } from '@/lib/analysis/expected-service'
import { fetchDeltas, type AllDeltas } from '@/lib/estimateSnapshots'
import { type DistanceKey } from '@/lib/goals'
export interface EstimateBundle {
  estimates: ExpectedEstimate[]
  updatedAt: string
  modelVersion: string
  dataVersion: number
  deltas?: AllDeltas
}
export async function loadEstimates(
  athleteId: number,
): Promise<EstimateBundle> {
  const [{ data: state }, { data: cached }] = await Promise.all([
    supabaseAdmin
      .from('athlete_state')
      .select('data_version')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    supabaseAdmin
      .from('user_latest_estimates')
      .select('result_json,model_version,updated_at')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
  ])
  const version = activeModelVersion(),
    dataVersion = Number(state?.data_version ?? 0)
  const stored = cached?.result_json as EstimateBundle | undefined
  if (
    stored &&
    stored.modelVersion === version &&
    stored.dataVersion === dataVersion &&
    stored.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
  )
    return {
      ...stored,
      deltas: await fetchDeltas(athleteId, estimateValues(stored)),
    }
  let estimates: ExpectedEstimate[]
  if (expectedEstimatorEnabled())
    estimates = await getExpectedEstimates(athleteId)
  else {
    const analysis = await getAthleteAnalysis(athleteId, {
      intervalLimit: 20,
      thresholdLimit: 20,
      longLimit: 20,
      easyLimit: 40,
      raceLimit: 15,
      allActivitiesLimit: 300,
    })
    estimates = (['5k', '10k', 'hm', 'fm'] as DistanceKey[]).map((key) => {
      const p = analysis.projection?.projections.find(
        (p) => p.distanceKey === key,
      )
      return {
        distanceKey: key,
        expectedSecs: p?.todaySecs ?? null,
        idealSecs: p?.idealSecs ?? null,
        lowSecs: p?.p80SecsLow ?? null,
        highSecs: p?.p80SecsHigh ?? null,
        confidence: p?.confidence ?? 'low',
        status: p ? 'ready' : 'insufficient_evidence',
        evidence: [],
        asOf: new Date().toISOString(),
        modelVersion: version,
        explanation: p
          ? 'Existing critical-pace model in usual conditions. Observed-effort calibration is awaiting validation. Range is an estimate, not a calibrated probability.'
          : 'Insufficient evidence for this distance.',
      }
    })
  }
  const bundle = {
    estimates,
    updatedAt: new Date().toISOString(),
    modelVersion: version,
    dataVersion,
  }
  // Persistence must not turn a successful analysis into a page-wide failure.
  // The RPC still rejects stale writes; background work can refresh the cache later.
  try {
    const { error } = await supabaseAdmin.rpc(
      'commit_estimates',
      {
        p_athlete: athleteId,
        p_version: dataVersion,
        p_bundle: bundle,
      },
    )
    if (error) console.error('Estimate cache write failed', { code: error.code })
  } catch {
    console.error('Estimate cache request failed')
  }
  return {
    ...bundle,
    deltas: await fetchDeltas(athleteId, estimateValues(bundle)),
  }
}
export function estimateValues(bundle: EstimateBundle): Record<string, number> {
  return Object.fromEntries(
    bundle.estimates
      .filter((e) => e.expectedSecs != null)
      .map((e) => [e.distanceKey, e.expectedSecs!]),
  )
}
