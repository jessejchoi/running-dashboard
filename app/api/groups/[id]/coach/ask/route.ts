import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  let body: { question?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const question = body.question?.trim() ?? ''
  if (!question || question.length > 500) {
    return NextResponse.json({ error: 'Question must be 1–500 characters' }, { status: 400 })
  }

  // Get asking athlete's name
  const { data: tokenRow } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_name')
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  const myName = tokenRow?.athlete_name ?? 'Athlete'

  try {
    const ctx = await buildCoachContext(params.id)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `You are RDCoach for ${ctx.group.name}. Direct, a bit snarky, knowledgeable running coach.
Answer in under 200 words. Reference the asking athlete's actual data when relevant.
The athlete asking is: ${myName}
Today: ${ctx.today}`

    const userPrompt = `Group data:
${JSON.stringify(ctx, null, 2)}

${myName} asks: ${question}`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (err) {
    console.error('[coach/ask]', err)
    return NextResponse.json({ error: 'Coach is taking a rest day.' }, { status: 503 })
  }
}
