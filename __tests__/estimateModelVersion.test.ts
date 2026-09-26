import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createQueryChain } from './helpers/supabase'
import { fetchSnapshotsByDate, buildAllDeltas } from '@/lib/estimateSnapshots'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/analysis/service', () => ({ getAthleteAnalysis: vi.fn() }))
vi.mock('@/lib/estimateSnapshots', () => ({ fetchDeltas: vi.fn(async () => ({})), fetchSnapshotsByDate: vi.fn(async () => ({})), buildAllDeltas: vi.fn(() => ({})) }))
import { supabaseAdmin } from '@/lib/supabase'
import { getAthleteAnalysis } from '@/lib/analysis/service'
import { loadEstimates } from '@/lib/estimates'
import { activeModelVersion, EXPECTED_MODEL_VERSION } from '@/lib/analysis/expected'
let cached: any
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchSnapshotsByDate).mockResolvedValue({})
  vi.mocked(buildAllDeltas).mockReturnValue({} as any)
  vi.stubEnv('EXPECTED_ESTIMATOR_ENABLED', 'false')
  vi.stubEnv('RACE_CALIBRATION_ENABLED', ''); delete process.env.RACE_CALIBRATION_ENABLED
  vi.stubEnv('MARATHON_ENDURANCE_ENABLED', ''); delete process.env.MARATHON_ENDURANCE_ENABLED
  cached = null
  vi.mocked(supabaseAdmin.from).mockImplementation(table => createQueryChain({data:table==='athlete_state'?{data_version:3}:cached,error:null}) as any)
  vi.mocked(supabaseAdmin.rpc).mockResolvedValue({data:null,error:null} as any)
  vi.mocked(getAthleteAnalysis).mockResolvedValue({projection:{projections:[{distanceKey:'5k',todaySecs:1200,idealSecs:1190,p80SecsLow:1128,p80SecsHigh:1272,confidence:'medium'}]}} as any)
})
afterEach(() => { vi.unstubAllEnvs() })
function cache(version:string, updatedAt=new Date().toISOString()) {
  const bundle={modelVersion:version,dataVersion:3,updatedAt,estimates:[{distanceKey:'5k',expectedSecs:1000}]}
  return {model_version:version,result_json:bundle}
}
it('recomputes same-day old-model values and writes the new version', async () => {
  cached=cache('cp-weatherdrift-v4')
  const result=await loadEstimates(1)
  expect(getAthleteAnalysis).toHaveBeenCalledOnce()
  expect(result.modelVersion).toBe('cp-weatherdrift-v4-race1')
  expect(result.estimates[0].expectedSecs).toBe(1200)
  expect(result.estimates[0].explanation).toContain('40%')
  expect(supabaseAdmin.rpc).toHaveBeenCalledWith('commit_estimates',expect.objectContaining({p_bundle:expect.objectContaining({modelVersion:activeModelVersion()})}))
})
it('reuses fresh values from the same model and data version', async () => {
  cached=cache(activeModelVersion())
  expect((await loadEstimates(1)).estimates[0].expectedSecs).toBe(1000)
  expect(getAthleteAnalysis).not.toHaveBeenCalled()
  expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
})
it('recomputes a previous-day bundle by default', async () => {
  cached=cache(activeModelVersion(), new Date(Date.now()-2*86400000).toISOString())
  expect((await loadEstimates(1)).estimates[0].expectedSecs).toBe(1200)
  expect(getAthleteAnalysis).toHaveBeenCalledOnce()
})
it('serves a previous-day bundle to page reads without recomputing', async () => {
  cached=cache(activeModelVersion(), new Date(Date.now()-2*86400000).toISOString())
  expect((await loadEstimates(1,{allowStaleDay:true})).estimates[0].expectedSecs).toBe(1000)
  expect(getAthleteAnalysis).not.toHaveBeenCalled()
  expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
})
it('never serves a bundle from an older data version, even to page reads', async () => {
  cached=cache(activeModelVersion())
  cached.result_json.dataVersion=2
  expect((await loadEstimates(1,{allowStaleDay:true})).estimates[0].expectedSecs).toBe(1200)
  expect(getAthleteAnalysis).toHaveBeenCalledOnce()
})
it('keeps the observed-estimator flag separate from the CP calibration', () => {
  expect(activeModelVersion()).toBe('cp-weatherdrift-v4-race1')
  vi.stubEnv('EXPECTED_ESTIMATOR_ENABLED','true')
  expect(activeModelVersion()).toBe(EXPECTED_MODEL_VERSION)
})
