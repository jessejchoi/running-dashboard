import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'
import { claudeStream } from '@/lib/claude'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const numericAthleteId = parseInt(athleteId)

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', numericAthleteId)
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
    .eq('athlete_id', numericAthleteId)
    .maybeSingle()

  const myName = tokenRow?.athlete_name ?? 'Athlete'

  // Fetch last 8 turns from coach_conversations for this athlete+group
  const { data: historyRows } = await supabaseAdmin
    .from('coach_conversations')
    .select('role, content')
    .eq('athlete_id', numericAthleteId)
    .eq('group_id', params.id)
    .order('created_at', { ascending: false })
    .limit(8)

  // Reverse to chronological order
  const history = (historyRows ?? []).reverse()
  const historyTurns = history.map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }))

  try {
    const ctx = await buildCoachContext(params.id)

    const systemPrompt = `You are RDCoach for ${ctx.group.name}. Direct, a bit snarky, knowledgeable running coach.
Answer in under 200 words. Reference the asking athlete's actual data when relevant.
The athlete asking is: ${myName}
Today: ${ctx.today}`

    const userPrompt = `Group data:
${JSON.stringify(ctx, null, 2)}

${myName} asks: ${question}`

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...historyTurns,
      { role: 'user', content: userPrompt },
    ]

    const stream = await claudeStream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages,
    })

    let fullAnswer = ''

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const text = chunk.delta.text
              fullAnswer += text
              controller.enqueue(new TextEncoder().encode(text))
            }
          }
          controller.close()
        } catch (streamErr) {
          const errMsg = '\n\n_[Connection interrupted — please try again]_'
          controller.enqueue(new TextEncoder().encode(errMsg))
          controller.close()
        }

        // Fire-and-forget: persist conversation turns
        supabaseAdmin
          .from('coach_conversations')
          .insert([
            { athlete_id: numericAthleteId, group_id: params.id, role: 'user', content: question },
            { athlete_id: numericAthleteId, group_id: params.id, role: 'assistant', content: fullAnswer },
          ])
          .then(() => {})
          .catch((err: Error) => console.error('[coach/ask/persist]', err.message))
      },
    })

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[coach/ask]', msg)
    return NextResponse.json({ error: 'Coach is taking a rest day.', detail: msg }, { status: 503 })
  }
}
