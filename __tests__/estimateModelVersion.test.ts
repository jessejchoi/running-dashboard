import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createQueryChain } from './helpers/supabase'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/analysis/service', () => ({ getAthleteAnalysis: vi.fn() }))
vi.mock('@/lib/estimateSnapshots', () => ({ fetchDeltas: vi.fn(async () => ({})) }))
import { supabaseAdmin } from '@/lib/supabase'
import { getAthleteAnalysis } from '@/lib/analysis/service'
import { loadEstimates } from '@/lib/estimates'
import { activeModelVersion, EXPECTED_MODEL_VERSION } from '@/lib/analysis/expected'
import { CP_MODEL_VERSION } from '@/lib/analysis/criticalPace'
let cached: any
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('EXPECTED_ESTIMATOR_ENABLED', 'false')
  cached = null
  vi.mocked(supabaseAdmin.from).mockImplementation(table => createQueryChain({data:table==='athlete_state'?{data_version:3}:cached,error:null}) as any)
  vi.mocked(supabaseAdmin.rpc).mockResolvedValue({data:null,error:null} as any)
  vi.mocked(getAthleteAnalysis).mockResolvedValue({projection:{projections:[{distanceKey:'5k',todaySecs:1200,idealSecs:1190,p80SecsLow:1128,p80SecsHigh:1272,confidence:'medium'}]}} as any)
})
afterEach(() => { vi.unstubAllEnvs() })
function cache(version:string) {
  const bundle={modelVersion:version,dataVersion:3,updatedAt:new Date().toISOString(),estimates:[{distanceKey:'5k',expectedSecs:1000}]}
  return {model_version:version,result_json:bundle}
}
it('recomputes same-day old-model values and writes the new version', async () => {
  cached=cache('cp-today-v1')
  const result=await loadEstimates(1)
  expect(getAthleteAnalysis).toHaveBeenCalledOnce()
  expect(result.modelVersion).toBe('cp-evidence6m-v3')
  expect(result.estimates[0].expectedSecs).toBe(1200)
  expect(result.estimates[0].explanation).toContain('40%')
  expect(supabaseAdmin.rpc).toHaveBeenCalledWith('commit_estimates',expect.objectContaining({p_bundle:expect.objectContaining({modelVersion:CP_MODEL_VERSION})}))
})
it('reuses fresh values from the same model and data version', async () => {
  cached=cache(CP_MODEL_VERSION)
  expect((await loadEstimates(1)).estimates[0].expectedSecs).toBe(1000)
  expect(getAthleteAnalysis).not.toHaveBeenCalled()
  expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
})
it('keeps the observed-estimator flag separate from the CP calibration', () => {
  expect(activeModelVersion()).toBe('cp-evidence6m-v3')
  vi.stubEnv('EXPECTED_ESTIMATOR_ENABLED','true')
  expect(activeModelVersion()).toBe(EXPECTED_MODEL_VERSION)
})
