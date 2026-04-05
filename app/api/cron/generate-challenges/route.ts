import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 60

// Runs on the 1st of each month. Generates one coach challenge per group.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: groups, error } = await supabaseAdmin
    .from('groups')
    .select('id')

  if (error || !groups?.length) {
    return NextResponse.json({ ok: true, generated: 0 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://running-dashboard.vercel.app'
  let generated = 0
  let skipped = 0
  const errors: string[] = []

  for (const group of groups) {
    try {
      const res = await fetch(`${baseUrl}/api/groups/${group.id}/challenges/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      if (data.skipped) skipped++
      else if (data.challenge) generated++
      else errors.push(`group ${group.id}: ${data.error ?? 'unknown error'}`)
    } catch (err) {
      errors.push(`group ${group.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({ ok: true, generated, skipped, errors })
}
