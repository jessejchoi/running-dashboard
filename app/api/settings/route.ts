import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: profile }, { data: tokenRow }] = await Promise.all([
    supabaseAdmin
      .from('user_profiles')
      .select('display_name, age, gender, unit, primary_group_id, weight_kg, max_hr, status_tag')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_data')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
  ])

  const athlete = tokenRow?.athlete_data as any
  const strava = athlete ? {
    display_name: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || null,
    gender: (athlete.sex as string) ?? null,
    weight_kg: athlete.weight ? Number(athlete.weight) : null,
  } : null

  return NextResponse.json({ profile: profile ?? {}, strava })
}

export async function PATCH(req: Request) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { display_name, age, gender, unit, weight_kg, max_hr, status_tag } = body

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .upsert({
      athlete_id: Number(athleteId),
      display_name: display_name ?? null,
      age: age ? Number(age) : null,
      gender: gender ?? null,
      unit: unit ?? 'km',
      weight_kg: weight_kg ? Number(weight_kg) : null,
      max_hr: max_hr ? Number(max_hr) : null,
      status_tag: status_tag ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Build response with unit_pref cookie set (non-httpOnly so client can read it)
  const response = NextResponse.json({ profile: data })
  response.cookies.set('unit_pref', unit ?? 'km', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  return response
}
