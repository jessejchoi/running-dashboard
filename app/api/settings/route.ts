import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('display_name, age, gender, unit, primary_group_id, weight_kg, max_hr')
    .eq('athlete_id', athleteId)
    .maybeSingle()

  return NextResponse.json({ profile: profile ?? {} })
}

export async function PATCH(req: Request) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { display_name, age, gender, unit, weight_kg, max_hr } = body

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
