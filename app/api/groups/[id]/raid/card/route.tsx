import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { getAthleteId } from '@/lib/auth'
import { groupRole } from '@/lib/groupAccess'
import { loadRaidState } from '@/lib/raidData'
import { CARD_HEIGHT, CARD_WIDTH, RaidCard, cardPeople, fetchAvatars, type CardKind } from '@/lib/raidCard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: CardKind[] = ['report', 'rally']
const fontDir = () => path.join(process.cwd(), 'lib/og-fonts')

async function fonts() {
  const [syne, mono, monoBold] = await Promise.all([
    readFile(path.join(fontDir(), 'Syne-Bold.woff')),
    readFile(path.join(fontDir(), 'SpaceMono-Regular.ttf')),
    readFile(path.join(fontDir(), 'SpaceMono-Bold.ttf')),
  ])
  return [
    { name: 'Syne', data: syne, weight: 700 as const, style: 'normal' as const },
    { name: 'Space Mono', data: mono, weight: 400 as const, style: 'normal' as const },
    { name: 'Space Mono', data: monoBold, weight: 700 as const, style: 'normal' as const },
  ]
}

/** The Boss Raid share card as a PNG: ?kind=report (last week's battle) or ?kind=rally (this week). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const kind = req.nextUrl.searchParams.get('kind') as CardKind | null
  if (!kind || !KINDS.includes(kind)) return NextResponse.json({ error: 'kind must be report or rally' }, { status: 400 })
  if (!(await groupRole(params.id, parseInt(athleteId)))) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  }

  const view = await loadRaidState(params.id)
  if (!view) return NextResponse.json({ error: 'Boss Raid is off' }, { status: 404 })

  const people = cardPeople(view, kind)
  const [avatars, fontData] = await Promise.all([
    fetchAvatars(Object.fromEntries(people.map(id => [id, view.members[id]?.pic ?? null]))),
    fonts(),
  ])
  return new ImageResponse(<RaidCard view={view} kind={kind} avatars={avatars} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: fontData,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
