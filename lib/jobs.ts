import { supabaseAdmin } from '@/lib/supabase'
export async function enqueueJob(
  kind: string,
  scope: string,
  version: string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await supabaseAdmin
    .from('background_jobs')
    .upsert(
      { kind, scope, input_version: version, payload },
      { onConflict: 'kind,scope,input_version', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw new Error('Could not queue work')
  return data?.[0]?.id as string | undefined
}
export async function claimJob(id: string) {
  const { data, error } = await supabaseAdmin.rpc('claim_job', { p_id: id })
  if (error) throw error
  return data?.[0] as
    | {
        id: string
        kind: string
        scope: string
        input_version: string
        payload: any
        lease_token: string
        attempts: number
      }
    | undefined
}
export async function finishJob(
  job: { id: string; lease_token: string; attempts?: number },
  error?: string,
  resumeAt?: string,
) {
  const { error: dbError } = await supabaseAdmin
    .from('background_jobs')
    .update({
      status: error ? 'queued' : 'done',
      last_error: error ?? null,
      available_at:
        resumeAt ??
        new Date(
          Date.now() +
            Math.min(3600000, 60000 * 2 ** Math.min(job.attempts ?? 0, 6)),
        ).toISOString(),
      lease_until: null,
    })
    .eq('id', job.id)
    .eq('lease_token', job.lease_token)
  if (dbError) throw dbError
}
