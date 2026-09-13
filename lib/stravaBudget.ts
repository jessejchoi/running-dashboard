import { supabaseAdmin } from '@/lib/supabase'
export function quotaResume(headers: Headers, now = Date.now()): number | null {
  let resume: number | null = null
  for (const prefix of ['x-ratelimit', 'x-readratelimit']) {
    const limits = headers.get(`${prefix}-limit`)?.split(',').map(Number)
    const usage = headers.get(`${prefix}-usage`)?.split(',').map(Number)
    if (!limits || !usage) continue
    if (usage[0] >= limits[0] - 5)
      resume = Math.max(
        resume ?? 0,
        (Math.floor(now / 900000) + 1) * 900000 + 1000,
      )
    if (usage[1] >= limits[1] - 20)
      resume = Math.max(
        resume ?? 0,
        (Math.floor(now / 86400000) + 1) * 86400000 + 1000,
      )
  }
  return resume
}
export async function stravaFetch(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15000),
  })
  const resume =
    quotaResume(res.headers) ??
    (res.status === 429 ? Date.now() + 900000 : null)
  if (resume) {
    const { error } = await supabaseAdmin.rpc('defer_strava', {
      p_until: new Date(resume).toISOString(),
    })
    if (error) console.error('[strava budget]', error.message)
  }
  return res
}
export async function importMayRun() {
  const { data, error } = await supabaseAdmin
    .from('strava_budget')
    .select('resume_at')
    .eq('id', true)
    .maybeSingle()
  if (error) throw new Error('Cannot read Strava quota state')
  return data?.resume_at && new Date(data.resume_at).getTime() > Date.now()
    ? (data.resume_at as string)
    : null
}
