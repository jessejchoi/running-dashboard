import type { ReactNode } from 'react'
import type { Tier } from '@/lib/rhythm'
import { RAID_WEEKS, type RaidFighter } from '@/lib/raid'
import { SPRITE_COLORS, SPRITE_SIZE, bossPixels, weaponPixels, type Pixel } from '@/lib/sprites'
import { attackHeadline, firstName, levelLabel, rallyNames, shortDate, stillNeeded } from '@/lib/raidCopy'
import type { RaidView } from '@/lib/raidData'
import { initials } from '@/lib/utils'

/*
 * The shareable Boss Raid cards, rendered by next/og (Satori) at 1080×1350.
 * Satori lays out flexbox only: every element with more than one child needs
 * display: flex. Colors are DESIGN.md's tokens as literals (no CSS variables).
 */

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350
export type CardKind = 'report' | 'rally'

const C = {
  bg: '#080808',
  surface1: '#111111',
  surface2: '#161616',
  surface3: '#0f0f0f',
  border: '#2a2a2a',
  accent: '#f97316',
  accentMuted: 'rgba(249,115,22,0.30)',
  text1: '#f0f0f0',
  text2: '#a1a1aa',
  text3: '#6b7280',
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
}
const DISPLAY = 'Syne'
const MONO = 'Space Mono'

export type Avatars = Record<number, string | null>

/**
 * Satori draws PNG and baseline JPEG; anything else (progressive JPEG, WebP)
 * throws mid-render and takes the whole card down, so it gets initials instead.
 */
export function drawableImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  // Walk the JPEG segments to the first start-of-frame: SOF0/SOF1 are baseline.
  for (let i = 2; i + 3 < bytes.length;) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]
    if (marker === 0xc0 || marker === 0xc1) return 'image/jpeg'
    if (marker >= 0xc2 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return null
    if (marker === 0xda) return null
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3])
  }
  return null
}

/** Total time allowed for fetching every avatar; slower ones fall back to initials. */
const AVATAR_BUDGET_MS = 2000

/** Avatars as data URIs, all sharing one time budget. */
export async function fetchAvatars(pics: Record<number, string | null>, budgetMs = AVATAR_BUDGET_MS): Promise<Avatars> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), budgetMs)
  try {
    const entries = await Promise.all(Object.entries(pics).map(async ([id, url]) => {
      if (!url || !url.startsWith('https://')) return [id, null] as const
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) return [id, null] as const
        const bytes = Buffer.from(await res.arrayBuffer())
        const type = drawableImageType(bytes)
        return [id, type ? `data:${type};base64,${bytes.toString('base64')}` : null] as const
      } catch {
        return [id, null] as const
      }
    }))
    return Object.fromEntries(entries)
  } finally {
    clearTimeout(timer)
  }
}

function Sprite({ pixels, size }: { pixels: Pixel[]; size: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`} shape-rendering="crispEdges">
      {pixels.map(p => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={SPRITE_COLORS[p.color]} />)}
    </svg>
  )
}

function Avatar({ name, src, size }: { name: string; src: string | null | undefined; size: number }) {
  if (src) return <img src={src} width={size} height={size} style={{ borderRadius: size, objectFit: 'cover' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: size, background: 'rgba(249,115,22,0.20)', color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 700, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  )
}

function Label({ children, color = C.text3, size = 22 }: { children: string; color?: string; size?: number }) {
  return <div style={{ fontFamily: MONO, fontSize: size, letterSpacing: 3, textTransform: 'uppercase', color }}>{children}</div>
}

/** Remaining HP in orange, the damage being dealt as a lighter chunk, the rest empty. */
function HpBar({ hp, remaining, chunk }: { hp: number; remaining: number; chunk: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(hp, 1)) * 100))}%`
  const after = Math.max(0, remaining - chunk)
  return (
    <div style={{ display: 'flex', width: '100%', height: 28, borderRadius: 6, background: C.surface3, border: `2px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ width: pct(after), background: C.accent }} />
      <div style={{ width: pct(Math.min(chunk, remaining)), background: C.accentMuted }} />
    </div>
  )
}

function Header({ view, right }: { view: RaidView; right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Label color={C.accent}>Boss Raid</Label>
        <div style={{ fontFamily: DISPLAY, fontSize: 36, color: C.text1, marginTop: 4 }}>{view.groupName}</div>
      </div>
      <Label>{right}</Label>
    </div>
  )
}

function BossBlock({ bossKey, name, hp, remaining, chunk, caption, defeated = false }: { bossKey: Parameters<typeof bossPixels>[0]; name: string; hp: number; remaining: number; chunk: number; caption: string; defeated?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 44, gap: 36 }}>
      <div style={{ display: 'flex', width: 232, height: 232, alignItems: 'center', justifyContent: 'center', background: C.surface1, border: `2px solid ${C.border}`, borderRadius: 16, opacity: defeated ? 0.35 : 1 }}>
        <Sprite pixels={bossPixels(bossKey)} size={192} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 60, lineHeight: 0.95, color: C.text1, textTransform: 'uppercase', letterSpacing: -1 }}>{name}</div>
        <div style={{ display: 'flex', marginTop: 24 }}>
          <HpBar hp={hp} remaining={remaining} chunk={chunk} />
        </div>
        <div style={{ display: 'flex', marginTop: 12 }}>
          <Label color={C.text2} size={22}>{caption}</Label>
        </div>
      </div>
    </div>
  )
}

function WeaponLine({ tier, extra }: { tier: Tier; extra?: string }) {
  return <Label color={C.text2} size={20}>{`${levelLabel(tier)}${extra ? ` · ${extra}` : ''}`}</Label>
}

function FighterChip({ f, avatars, sub = `${f.power} dmg` }: { f: RaidFighter; avatars: Avatars; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface1, border: `2px solid ${C.border}`, borderRadius: 12, padding: '10px 16px 10px 10px' }}>
      <Avatar name={f.name} src={avatars[f.athlete_id]} size={48} />
      <Sprite pixels={weaponPixels(f.tier.key)} size={40} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, color: C.text1 }}>{firstName(f.name)}</div>
        <div style={{ fontFamily: MONO, fontSize: 18, color: C.text2 }}>{sub}</div>
      </div>
    </div>
  )
}

function Footer({ note }: { note: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
      <Label color={C.warning} size={20}>{note ?? ''}</Label>
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 30, color: C.text1 }}>
        RUN<span style={{ color: C.accent }}>DASH</span>
      </div>
    </div>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', flexDirection: 'column', background: C.bg, padding: 64, fontFamily: MONO, color: C.text1 }}>
      {children}
    </div>
  )
}

function Countdown({ view, avatars }: { view: RaidView; avatars: Avatars }) {
  const { state } = view
  const fighters = state.roster.filter(r => r.role !== 'dormant').slice(0, 8)
  return (
    <Frame>
      <Header view={view} right="Hype week" />
      <BossBlock bossKey={state.nextBoss.key} name={state.nextBoss.name} hp={1} remaining={1} chunk={0} caption={`Arrives ${shortDate(state.firstRaidStart)}`} />
      <div style={{ fontFamily: DISPLAY, fontSize: 64, lineHeight: 1, marginTop: 64, color: C.accent, textTransform: 'uppercase' }}>Sharpen your weapons</div>
      <div style={{ fontFamily: MONO, fontSize: 26, color: C.text2, marginTop: 16 }}>Every on-target week until then levels you up.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 44 }}>
        {fighters.map(r => (
          <div key={r.athlete_id} style={{ display: 'flex', alignItems: 'center', gap: 12, width: 456, background: C.surface1, border: `2px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <Avatar name={r.name} src={avatars[r.athlete_id]} size={56} />
            <Sprite pixels={weaponPixels(r.tier.key)} size={48} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24 }}>{firstName(r.name)}</div>
              <WeaponLine tier={r.tier} />
            </div>
          </div>
        ))}
      </div>
      <Footer note={null} />
    </Frame>
  )
}

function Report({ view, avatars }: { view: RaidView; avatars: Avatars }) {
  const report = view.report!
  const { raid, week, raidWeek, shame } = report
  const before = raid.hp - raid.weeks.slice(0, raidWeek - 1).reduce((s, w) => s + w.damage, 0)
  const after = Math.max(0, before - week.damage)
  const slainNow = raid.slainWeek === raidWeek
  const overkill = before <= 0
  const escaped = raid.status === 'escaped' && raidWeek === RAID_WEEKS
  const others = week.attackers.filter(f => f.athlete_id !== week.mvp?.athlete_id).slice(0, 6)

  return (
    <Frame>
      <Header view={view} right={`Raid #${raid.number} · Week ${raidWeek}/${RAID_WEEKS}`} />
      <BossBlock
        bossKey={raid.boss.key}
        name={raid.boss.name}
        hp={raid.hp}
        remaining={Math.max(0, before)}
        chunk={week.damage}
        caption={overkill ? `Slain · overkill +${week.damage}` : `HP ${Math.max(0, before)} → ${after} / ${raid.hp}`}
        defeated={overkill || slainNow}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginTop: 48 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 54, lineHeight: 1, textTransform: 'uppercase', color: week.landed ? C.success : C.error }}>{attackHeadline(week)}</div>
      </div>
      {slainNow && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 40, color: C.accent, textTransform: 'uppercase' }}>{`${raid.boss.name} slain!`}</div>
          <Label color={C.text2}>{`Bosses slain: ${view.state.bossesSlain}${raid.overkill > 0 ? ` · Overkill +${raid.overkill}` : ''}`}</Label>
        </div>
      )}
      {escaped && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 40, color: C.error, textTransform: 'uppercase' }}>{`The ${raid.boss.name} escaped`}</div>
          <div style={{ fontFamily: MONO, fontSize: 26, color: C.text2, marginTop: 8 }}>{`"${report.taunt}"`}</div>
        </div>
      )}

      {week.mvp && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 36, background: C.surface2, border: `2px solid ${C.accent}`, borderRadius: 16, padding: 24 }}>
          <Avatar name={week.mvp.name} src={avatars[week.mvp.athlete_id]} size={104} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <Label color={C.accent}>MVP</Label>
            <div style={{ fontFamily: DISPLAY, fontSize: 48, color: C.text1, marginTop: 4 }}>{firstName(week.mvp.name)}</div>
            <WeaponLine tier={week.mvp.tier} extra={`${week.mvp.power} dmg`} />
          </div>
          <Sprite pixels={weaponPixels(week.mvp.tier.key)} size={112} />
        </div>
      )}
      {others.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
          {others.map(f => <FighterChip key={f.athlete_id} f={f} avatars={avatars} sub={week.landed ? undefined : 'showed up'} />)}
        </div>
      )}

      {shame.entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 36 }}>
          <Label color={week.landed ? C.text3 : C.error}>{week.landed ? 'Missed the fight' : 'Let the boss live'}</Label>
          {shame.entries.map(e => (
            <div key={e.athlete_id} style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
              <Avatar name={e.name} src={avatars[e.athlete_id]} size={52} />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.text1 }}>{e.line}</div>
                <div style={{ fontFamily: MONO, fontSize: 20, color: C.accent, marginTop: 2 }}>{e.wayBack}</div>
              </div>
            </div>
          ))}
          {shame.overflow > 0 && <div style={{ fontFamily: MONO, fontSize: 20, color: C.text3, marginTop: 12 }}>{`+${shame.overflow} others`}</div>}
        </div>
      )}
      <Footer note={week.provisional || raid.hpProvisional ? 'Provisional until the Wednesday freeze' : null} />
    </Frame>
  )
}

function Rally({ view, avatars }: { view: RaidView; avatars: Avatars }) {
  const { state } = view
  const raid = state.raid!
  const week = state.thisWeek
  const hpLeft = Math.max(0, raid.hp - raid.damage)
  const pending = stillNeeded(week, state.daysLeft)
  const need = Math.max(0, week.majority - week.attackers.length)
  const blocked = !week.landed && pending.length < need
  const slain = raid.status === 'slain'

  const headline = slain ? `Slain in week ${raid.slainWeek}`
    : week.landed ? 'Attack locked in'
    : blocked ? 'Attack blocked'
    : `Attack needs ${need} more`
  const color = slain ? C.accent : week.landed ? C.success : blocked ? C.error : C.accent

  return (
    <Frame>
      <Header view={view} right={`Raid #${raid.number} · Week ${raid.weeks.length}/${RAID_WEEKS}`} />
      <BossBlock
        bossKey={raid.boss.key}
        name={raid.boss.name}
        hp={raid.hp}
        remaining={hpLeft}
        chunk={week.locked}
        caption={slain ? `Overkill ${raid.overkill} so far` : `HP ${hpLeft} / ${raid.hp}`}
        defeated={slain}
      />
      <div style={{ fontFamily: DISPLAY, fontSize: 58, lineHeight: 1, marginTop: 56, textTransform: 'uppercase', color }}>{headline}</div>
      <div style={{ fontFamily: MONO, fontSize: 28, color: C.text1, marginTop: 20 }}>
        {slain ? 'Keep your weapons climbing: every hit still counts as overkill.'
          : week.landed ? `${week.attackers.length} of ${week.eligible.length} on target.`
          : pending.length ? rallyNames(pending.slice(0, 4)) : 'Nobody left who can make it this week.'}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 36 }}>
        {[
          ['Days left', `${state.daysLeft}`],
          ['Locked', `${week.locked}`],
          ['Possible', `${week.possible}`],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', flex: 1, background: C.surface2, borderRadius: 12, padding: '18px 22px' }}>
            <Label size={18}>{label}</Label>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 56, color: C.text1, marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>
      {week.attackers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 36 }}>
          <Label>Attacking</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
            {week.attackers.slice(0, 8).map(f => <FighterChip key={f.athlete_id} f={f} avatars={avatars} />)}
          </div>
        </div>
      )}
      <Footer note={null} />
    </Frame>
  )
}

/** Who needs an avatar on this card. */
export function cardPeople(view: RaidView, kind: CardKind): number[] {
  const { state, report } = view
  if (!state.raid && !(kind === 'report' && report)) return state.roster.filter(r => r.role !== 'dormant').slice(0, 8).map(r => r.athlete_id)
  if (kind === 'report' && report) {
    return [...report.week.attackers.slice(0, 7).map(f => f.athlete_id), ...report.shame.entries.map(e => e.athlete_id)]
  }
  return state.thisWeek.attackers.slice(0, 8).map(f => f.athlete_id)
}

export function RaidCard({ view, kind, avatars }: { view: RaidView; kind: CardKind; avatars: Avatars }) {
  if (kind === 'report' && view.report) return <Report view={view} avatars={avatars} />
  if (view.state.raid) return <Rally view={view} avatars={avatars} />
  return <Countdown view={view} avatars={avatars} />
}
