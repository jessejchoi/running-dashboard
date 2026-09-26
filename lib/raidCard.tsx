import type { ReactNode } from 'react'
import { tierNumber, type Tier } from '@/lib/rhythm'
import { RAID_WEEKS, type Boss, type RaidSummary } from '@/lib/raid'
import { SPRITE_COLORS, SPRITE_SIZE, bossPixels, weaponPixels, type Pixel } from '@/lib/sprites'
import { firstName, shortDate, stillNeeded } from '@/lib/raidCopy'
import type { RaidView } from '@/lib/raidData'
import { initials } from '@/lib/utils'

/*
 * The shareable Boss Raid cards, rendered by next/og (Satori) at 1080×1350.
 * Satori lays out flexbox only: every element with more than one child needs
 * display: flex. Colors are DESIGN.md's tokens as literals (no CSS variables).
 *
 *   ┌ BOSS RAID · group ─────────── RUNDASH ┐
 *   │        glowing boss on its stage       │  stamps: SLAIN / ESCAPED / BLOCKED
 *   │  HP 18 /25 ▮▮▮▮▮▮▮▮▯▯▯▯  −6 this week │  damage floats on the recap
 *   │  [ status banner ]                     │
 *   │  the party: weapon + target pips each  │
 *   └────────────────────────────────────────┘
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
  text1: '#f0f0f0',
  text2: '#a1a1aa',
  text3: '#6b7280',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#eab308',
}
const DISPLAY = 'Syne'
const MONO = 'Space Mono'
const PAD = 56

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

function Mono({ children, size = 22, color = C.text3, bold = false, spacing = 3 }: { children: ReactNode; size?: number; color?: string; bold?: boolean; spacing?: number }) {
  return <div style={{ display: 'flex', fontFamily: MONO, fontSize: size, fontWeight: bold ? 700 : 400, letterSpacing: spacing, textTransform: 'uppercase', color }}>{children}</div>
}

function Frame({ view, children }: { view: RaidView; children: ReactNode }) {
  return (
    <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', flexDirection: 'column', background: C.bg, color: C.text1, fontFamily: MONO, paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `40px ${PAD}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 14, height: 14, background: C.accent }} />
          <Mono color={C.accent} bold spacing={5}>Boss Raid</Mono>
          <Mono color={C.text2} spacing={2}>{`· ${view.groupName}`}</Mono>
        </div>
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 28, color: C.text1 }}>
          RUN<span style={{ color: C.accent }}>DASH</span>
        </div>
      </div>
      {children}
    </div>
  )
}

type Stamp = { text: string; color: string } | null

/** The boss on a glowing stage, with an optional stamp and a floating damage number. */
function Stage({ boss, tag, stamp = null, hit = 0, dim = false, sprite = 250 }: { boss: Boss; tag: string; stamp?: Stamp; hit?: number; dim?: boolean; sprite?: number }) {
  const glow = stamp?.color === C.error ? 'rgba(239,68,68,0.28)' : 'rgba(249,115,22,0.34)'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', marginTop: 8, paddingTop: 10,
      backgroundImage: `radial-gradient(circle at 50% 44%, ${glow} 0%, rgba(249,115,22,0.06) 34%, rgba(8,8,8,0) 58%)`,
    }}>
      <Mono color={C.accent} spacing={6}>{tag}</Mono>
      <div style={{ display: 'flex', position: 'relative', marginTop: 10, opacity: dim ? 0.28 : 1 }}>
        <Sprite pixels={bossPixels(boss.key)} size={sprite} />
      </div>
      {/* the floor the boss stands on */}
      <div style={{ display: 'flex', width: 520, height: 3, marginTop: -6, backgroundImage: 'linear-gradient(90deg, rgba(249,115,22,0) 0%, #f97316 50%, rgba(249,115,22,0) 100%)' }} />
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 72, lineHeight: 1, marginTop: 18, textTransform: 'uppercase', letterSpacing: -1, textShadow: '0 0 36px rgba(249,115,22,0.45)' }}>{boss.name}</div>
      {hit > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', top: 60, right: 170 }}>
          <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 116, lineHeight: 1, color: C.accent, textShadow: '0 0 30px rgba(249,115,22,0.8)' }}>{`-${hit}`}</div>
          <Mono size={22} color={C.accent} bold spacing={6}>dmg</Mono>
        </div>
      )}
      {stamp && (
        <div style={{ display: 'flex', position: 'absolute', top: 130, fontFamily: DISPLAY, fontSize: stamp.text.length > 5 ? 76 : 100, color: stamp.color, border: `8px solid ${stamp.color}`, borderRadius: 12, padding: '0 30px', transform: 'rotate(-10deg)', background: 'rgba(8,8,8,0.55)' }}>{stamp.text}</div>
      )}
    </div>
  )
}

/** Chunky HP: remaining segments in orange, this hit as hollow orange, the rest empty. */
function HpBlock({ hp, remaining, chunk, right, rightColor = C.accent }: { hp: number; remaining: number; chunk: number; right: string; rightColor?: string }) {
  const n = Math.min(hp, 30)
  const seg = (v: number) => Math.round((Math.max(0, v) / Math.max(hp, 1)) * n)
  const after = seg(remaining - chunk)
  const before = Math.max(after, seg(remaining))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: `0 ${PAD}px`, marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <Mono size={24} spacing={4}>HP</Mono>
          <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 700, fontSize: 58, lineHeight: 1 }}>{`${Math.max(0, remaining - chunk)}`}</div>
          <Mono size={30} spacing={0}>{`/${hp}`}</Mono>
        </div>
        <Mono size={26} color={rightColor} bold spacing={3}>{right}</Mono>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 14 }}>
        {Array.from({ length: n }, (_, i) => {
          const full = i < after
          const hit = !full && i < before
          return <div key={i} style={{ display: 'flex', flex: 1, height: 32, borderRadius: 3, background: full ? C.accent : hit ? 'rgba(249,115,22,0.18)' : C.surface2, border: `2px solid ${full || hit ? C.accent : C.border}` }} />
        })}
      </div>
    </div>
  )
}

function Banner({ text, right, color, bg }: { text: string; right: string; color: string; bg: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: `22px ${PAD}px 0`, padding: '16px 28px', borderRadius: 14, background: bg, border: `2px solid ${color}` }}>
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: 40, lineHeight: 1, color, textTransform: 'uppercase' }}>{text}</div>
      <Mono size={24} color={C.text1} bold spacing={2}>{right}</Mono>
    </div>
  )
}

interface PartyRow {
  id: number
  name: string
  tier: Tier
  runs: number
  target: number
  on: boolean
  /** Right-hand status: "in", "2 to go", "+3 dmg", "missed"… */
  status: string
  statusColor: string
  faded?: boolean
}

function Pips({ runs, target, on, size }: { runs: number; target: number; on: boolean; size: number }) {
  const shown = Math.min(target, 7)
  return (
    <div style={{ display: 'flex', gap: Math.round(size / 5) }}>
      {Array.from({ length: shown }, (_, i) => {
        const done = on || i < runs
        const fill = on ? C.success : done ? C.accent : C.surface3
        return <div key={i} style={{ display: 'flex', width: size, height: size, borderRadius: 3, background: fill, border: `2px solid ${done ? fill : C.border}` }} />
      })}
    </div>
  )
}

function Party({ title, rows, avatars, compact = rows.length > 6 }: { title: string; rows: PartyRow[]; avatars: Avatars; compact?: boolean }) {
  const avatar = compact ? 40 : 52
  const maxTarget = Math.max(1, ...rows.map(r => r.target))
  const pip = compact ? (maxTarget > 4 ? 13 : 18) : 26
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: `0 ${PAD}px`, marginTop: 24 }}>
      <Mono size={20} spacing={4}>{title}</Mono>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {rows.slice(0, 10).map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: compact ? 8 : 14, width: compact ? 479 : 968, padding: compact ? '8px 12px' : '8px 18px',
            background: C.surface1, borderRadius: 12, border: `2px solid ${r.on ? 'rgba(34,197,94,0.45)' : C.border}`, opacity: r.faded ? 0.45 : 1,
          }}>
            <Avatar name={r.name} src={avatars[r.id]} size={avatar} />
            <div style={{ display: 'flex', flexDirection: 'column', width: compact ? 118 : 190 }}>
              <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 700, fontSize: compact ? 20 : 26, color: C.text1 }}>{firstName(r.name)}</div>
              <Mono size={compact ? 12 : 16} color={C.text2} spacing={compact ? 0 : 1}>{`Lv ${tierNumber(r.tier)} ${r.tier.name}`}</Mono>
            </div>
            <Sprite pixels={weaponPixels(r.tier.key)} size={compact ? 32 : 44} />
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: compact ? 6 : 12, marginLeft: compact ? 2 : 6 }}>
              <Pips runs={r.runs} target={r.target} on={r.on} size={pip} />
              <Mono size={compact ? 16 : 22} color={C.text2} spacing={0}>{`${r.runs}/${r.target}`}</Mono>
            </div>
            <Mono size={compact ? 15 : 20} color={r.statusColor} bold spacing={1}>{r.status}</Mono>
          </div>
        ))}
      </div>
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function thisWeekRows(view: RaidView): PartyRow[] {
  return view.state.roster.map(r => ({
    id: r.athlete_id,
    name: r.name,
    tier: r.tier,
    runs: r.runs,
    target: r.target,
    on: r.on,
    status: r.role === 'dormant' ? 'zzz' : r.role === 'new' ? 'next wk' : r.on ? 'in' : `${r.needed} to go`,
    statusColor: r.role !== 'fighting' ? C.text3 : r.on ? C.success : C.accent,
    faded: r.role !== 'fighting',
  }))
}

function Countdown({ view, avatars }: { view: RaidView; avatars: Avatars }) {
  const { state } = view
  const hp = state.projectedHp ?? 0
  return (
    <Frame view={view}>
      <Stage boss={state.nextBoss} tag={`Incoming · ${shortDate(state.firstRaidStart)}`} />
      <HpBlock hp={hp} remaining={hp} chunk={0} right="Full HP" rightColor={C.text2} />
      <Banner text="Sharpen your weapons" right={`${plural(state.daysLeft, 'day')} left`} color={C.accent} bg="rgba(249,115,22,0.10)" />
      <Party title="The party · this week's targets" rows={thisWeekRows(view)} avatars={avatars} />
    </Frame>
  )
}

function Rally({ view, avatars }: { view: RaidView; avatars: Avatars }) {
  const { state } = view
  const raid = state.raid!
  const week = state.thisWeek
  const hpLeft = Math.max(0, raid.hp - raid.damage)
  const need = Math.max(0, week.majority - week.attackers.length)
  const blocked = !week.landed && stillNeeded(week, state.daysLeft).length < need
  const slain = raid.status === 'slain'
  const banner = slain ? { text: 'Overkill round', color: C.accent, bg: 'rgba(249,115,22,0.10)' }
    : week.landed ? { text: 'Attack locked in', color: C.success, bg: 'rgba(34,197,94,0.10)' }
    : blocked ? { text: 'Attack blocked', color: C.error, bg: 'rgba(239,68,68,0.10)' }
    : { text: `Need ${need} more`, color: C.accent, bg: 'rgba(249,115,22,0.10)' }
  return (
    <Frame view={view}>
      <Stage
        boss={raid.boss}
        tag={`Raid ${raid.number} · Week ${raid.weeks.length}/${RAID_WEEKS}`}
        stamp={slain ? { text: 'SLAIN', color: C.accent } : null}
        dim={slain}
      />
      <HpBlock
        hp={raid.hp}
        remaining={hpLeft}
        chunk={slain ? 0 : week.locked}
        right={slain ? `Overkill +${raid.overkill}` : week.locked ? `-${week.locked} this week` : 'No damage yet'}
        rightColor={week.locked || slain ? C.accent : C.text3}
      />
      <Banner text={banner.text} right={`${plural(state.daysLeft, 'day')} left`} color={banner.color} bg={banner.bg} />
      <Party title="The party · this week's targets" rows={thisWeekRows(view)} avatars={avatars} />
    </Frame>
  )
}

function RaidStrip({ raid }: { raid: RaidSummary }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: `0 ${PAD}px`, marginTop: 16 }}>
      {Array.from({ length: RAID_WEEKS }, (_, i) => {
        const w = raid.weeks[i]
        const done = w && !w.open
        const color = !done ? C.text3 : w.landed ? C.success : C.error
        return (
          <div key={i} style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: 10, background: C.surface1, border: `2px solid ${C.border}` }}>
            <Mono size={18}>{`Wk ${i + 1}`}</Mono>
            <Mono size={24} bold color={color} spacing={0}>{!done ? '-' : w.landed ? `${w.damage}` : 'X'}</Mono>
          </div>
        )
      })}
    </div>
  )
}

function Recap({ view, avatars }: { view: RaidView; avatars: Avatars }) {
  const report = view.report!
  const { raid, week, raidWeek, shame } = report
  const before = raid.hp - raid.weeks.slice(0, raidWeek - 1).reduce((s, w) => s + w.damage, 0)
  const slainNow = raid.slainWeek === raidWeek
  const overkill = before <= 0
  const escaped = raid.status === 'escaped' && raidWeek === RAID_WEEKS
  const final = slainNow || escaped
  const stamp: Stamp = slainNow || overkill ? { text: 'SLAIN', color: C.accent }
    : escaped ? { text: 'ESCAPED', color: C.error }
    : !week.landed ? { text: 'BLOCKED', color: C.error }
    : null
  const shamed = new Set(shame.entries.map(e => e.athlete_id))
  const rows: PartyRow[] = [
    ...week.eligible.map(f => ({
      id: f.athlete_id,
      name: f.name,
      tier: f.tier,
      runs: f.runs,
      target: f.target,
      on: f.state === 'on',
      status: f.state === 'on' ? (week.landed ? `+${f.power} dmg` : 'showed up') : shamed.has(f.athlete_id) && !week.landed ? 'blocked' : 'missed',
      statusColor: f.state === 'on' ? (week.landed ? C.success : C.text2) : C.error,
    })),
    ...week.dormant.map(d => ({ id: d.athlete_id, name: d.name, tier: view.state.roster.find(r => r.athlete_id === d.athlete_id)?.tier ?? { key: 'unarmed', name: 'Unarmed', min: 0, power: 0 } as Tier, runs: 0, target: 1, on: false, status: 'zzz', statusColor: C.text3, faded: true })),
  ]
  const mvp = week.mvp
  return (
    <Frame view={view}>
      <Stage
        boss={raid.boss}
        tag={`Raid ${raid.number} · ${final ? 'Final recap' : `Week ${raidWeek} recap`}`}
        stamp={stamp}
        hit={week.landed && !overkill ? week.damage : 0}
        dim={slainNow || overkill}
        sprite={final ? 200 : 230}
      />
      <HpBlock
        hp={raid.hp}
        remaining={Math.max(0, before)}
        chunk={week.damage}
        right={week.landed ? `-${week.damage} dmg${overkill ? ' overkill' : ''}` : 'No damage'}
        rightColor={week.landed ? C.accent : C.error}
      />
      <Banner
        text={week.landed ? 'Attack landed' : 'Attack failed'}
        right={mvp ? `MVP ${firstName(mvp.name)} · ${mvp.power} dmg` : `${week.attackers.length} of ${week.eligible.length} on target`}
        color={week.landed ? C.success : C.error}
        bg={week.landed ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)'}
      />
      {final && <RaidStrip raid={raid} />}
      {escaped && report.taunt && (
        <div style={{ display: 'flex', padding: `0 ${PAD}px`, marginTop: 16, fontFamily: MONO, fontSize: 22, lineHeight: 1.4, color: C.text2 }}>{`"${report.taunt}"`}</div>
      )}
      <Party title="The party · last week" rows={rows} avatars={avatars} compact={rows.length > (shame.entries.length || final ? 2 : 6)} />
      {shame.entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', padding: `0 ${PAD}px`, marginTop: 18, gap: 10 }}>
          {shame.entries.map(e => (
            <div key={e.athlete_id} style={{ display: 'flex', flexDirection: 'column', paddingLeft: 16, borderLeft: `4px solid ${e.kind === 'blocker' ? C.error : C.accent}` }}>
              <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 700, fontSize: 21, color: C.text1 }}>{e.line}</div>
              <div style={{ display: 'flex', fontFamily: MONO, fontSize: 18, color: C.accent }}>{e.wayBack}</div>
            </div>
          ))}
          {shame.overflow > 0 && <Mono size={18} spacing={1}>{`+${shame.overflow} others`}</Mono>}
        </div>
      )}
    </Frame>
  )
}

/** Who needs an avatar on this card. */
export function cardPeople(view: RaidView, kind: CardKind): number[] {
  if (kind === 'report' && view.report) {
    const w = view.report.week
    return [...w.eligible.map(f => f.athlete_id), ...w.dormant.map(d => d.athlete_id)].slice(0, 10)
  }
  return view.state.roster.slice(0, 10).map(r => r.athlete_id)
}

export function RaidCard({ view, kind, avatars }: { view: RaidView; kind: CardKind; avatars: Avatars }) {
  if (kind === 'report' && view.report) return <Recap view={view} avatars={avatars} />
  if (view.state.raid) return <Rally view={view} avatars={avatars} />
  return <Countdown view={view} avatars={avatars} />
}
