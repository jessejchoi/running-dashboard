'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { addDays } from '@/lib/calendar'
import { HP_FACTOR, RAID_WEEKS, type RaidRosterEntry, type RaidSummary, type RaidWeekResult } from '@/lib/raid'
import { attackHeadline, firstName, rallyNames, shareText, stillNeeded } from '@/lib/raidCopy'
import type { RaidReport, RaidView } from '@/lib/raidData'
import { Avatar } from '@/components/GroupShared'
import WeaponSprite, { BossSprite } from '@/components/WeaponSprite'
import ShareCardButton from '@/components/ShareCardButton'

const LABEL = 'font-mono text-[10px] uppercase tracking-widest'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const day = (d: string) => format(parseISO(d), 'EEE MMM d')

type Load = { status: 'loading' } | { status: 'off' } | { status: 'error' } | { status: 'ready'; view: RaidView }

function Eyebrow({ children, color = 'var(--text-muted)' }: { children: ReactNode; color?: string }) {
  return <p className={LABEL} style={{ color }}>{children}</p>
}

function Chip({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span className="font-mono text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color, background: bg, padding: '4px 8px', borderRadius: 4 }}>
      {children}
    </span>
  )
}

/** Remaining HP in orange, this week's locked damage as a lighter chunk. */
function HpBar({ hp, remaining, chunk }: { hp: number; remaining: number; chunk: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(hp, 1)) * 100))}%`
  const after = Math.max(0, remaining - chunk)
  return (
    <div className="flex w-full overflow-hidden" style={{ height: 12, borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--border)' }}
      role="img" aria-label={`${remaining} of ${hp} HP left${chunk ? `, ${Math.min(chunk, remaining)} damage locked this week` : ''}`}>
      <div style={{ width: pct(after), background: 'var(--accent)' }} />
      <div style={{ width: pct(Math.min(chunk, remaining)), background: 'rgba(249,115,22,0.35)' }} />
    </div>
  )
}

function HpReadout({ value, hp }: { value: number; hp: number }) {
  return (
    <p className="flex items-baseline gap-1.5 mb-1.5">
      <span className="stat-num font-bold text-white leading-none" style={{ fontSize: 32 }}>{value}</span>
      <span className="font-mono text-[12px]" style={{ color: 'var(--text-2)' }}>/ {hp} HP</span>
    </p>
  )
}

/** A row of separate segments, `filled` of them lit. */
function SegmentBar({ count, filled, color, label, mark = 0 }: { count: number; filled: number; color: string; label: string; mark?: number }) {
  return (
    <div className="flex mt-2" style={{ gap: 6 }} role="img" aria-label={label}>
      {Array.from({ length: count }, (_, i) => {
        const on = i < filled
        return <div key={i} style={{ flex: 1, height: 8, borderRadius: 2, background: on ? color : 'var(--surface-3)', border: `1px solid ${on ? color : i < mark ? 'var(--accent)' : 'var(--border)'}` }} />
      })}
    </div>
  )
}

/** Damage segments: one per point, grouped when the max is large so they stay readable. */
const DAMAGE_SEGMENTS = 20

function BossHero({ view }: { view: RaidView }) {
  const { state } = view
  const raid = state.raid
  const boss = raid?.boss ?? state.nextBoss
  const hpLeft = raid ? Math.max(0, raid.hp - raid.damage) : 0
  const slain = raid?.status === 'slain'
  const provisional = raid?.hpProvisional || state.thisWeek.provisional

  return (
    <div className="card fade-up col-span-12" style={{ padding: '1.25rem' }}>
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="shrink-0 rounded-lg flex items-center justify-center" style={{ width: 104, height: 104, background: 'var(--surface-3)', border: `1px solid ${slain ? 'var(--border)' : 'var(--accent)'}`, opacity: slain ? 0.4 : 1 }}>
          <BossSprite boss={boss} size={84} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow color="var(--accent)">
              {raid ? `Raid #${raid.number} · Week ${raid.weeks.length}/${RAID_WEEKS}` : `Arrives ${day(state.firstRaidStart)}`}
            </Eyebrow>
            {slain && <Chip color="var(--accent)" bg="var(--accent-muted)">Slain</Chip>}
            {!slain && provisional && <Chip color="var(--warning)" bg="var(--warning-bg)">Provisional</Chip>}
          </div>
          <h2 className="font-display font-bold uppercase text-white leading-none mt-1.5" style={{ fontSize: 'clamp(20px, 5vw, 26px)', letterSpacing: '-0.02em' }}>{boss.name}</h2>
          {raid ? (
            <div className="mt-3">
              <HpReadout value={slain ? 0 : hpLeft} hp={raid.hp} />
              <HpBar hp={raid.hp} remaining={hpLeft} chunk={slain ? 0 : state.thisWeek.locked} />
              <p className="font-mono text-[11px] mt-1.5" style={{ color: 'var(--text-2)' }}>
                {slain
                  ? `Down in week ${raid.slainWeek} · overkill ${raid.overkill}`
                  : state.thisWeek.locked > 0 && <><span style={{ color: 'var(--accent)' }}>{state.thisWeek.locked} locked this week</span> · </>}
                {!slain && `ends ${day(raid.end)}`}
              </p>
            </div>
          ) : state.projectedHp != null && (
            <div className="mt-3">
              <HpReadout value={state.projectedHp} hp={state.projectedHp} />
              <HpBar hp={state.projectedHp} remaining={state.projectedHp} chunk={0} />
            </div>
          )}
        </div>
      </div>
      {raid && <p className="text-[14px] mt-4 leading-snug" style={{ color: 'var(--text-1)' }}>{view.summary}</p>}
    </div>
  )
}

/** Bosses slain and raids fought, at the foot of the last-week card. */
function RaidStats({ view }: { view: RaidView }) {
  const { state } = view
  return (
    <div className="grid grid-cols-2 gap-2 mt-4">
      {([
        ['Bosses slain', `${state.bossesSlain}`],
        ['Raids fought', `${state.raidsFought + (state.raid ? 1 : 0)}`],
      ] as const).map(([label, value]) => (
        <div key={label} className="rounded-lg" style={{ background: 'var(--surface-2)', padding: '8px 10px' }}>
          <Eyebrow>{label}</Eyebrow>
          <div className="stat-num text-white font-bold leading-none mt-1.5" style={{ fontSize: 22 }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function AttackCard({ view }: { view: RaidView }) {
  const { state } = view
  const week = state.thisWeek
  const pending = stillNeeded(week, state.daysLeft)
  const need = Math.max(0, week.majority - week.attackers.length)
  const blocked = !week.landed && pending.length < need
  const status = !week.eligible.length ? { text: 'No fighters yet', color: 'var(--text-2)', bg: 'var(--surface-2)' }
    : week.landed ? { text: 'Attack locked in', color: 'var(--success)', bg: 'var(--success-bg)' }
    : blocked ? { text: 'Attack blocked', color: 'var(--error)', bg: 'var(--error-bg)' }
    : { text: `Needs ${need} more`, color: 'var(--accent)', bg: 'var(--accent-muted)' }

  return (
    <div className="card fade-up col-span-12 md:col-span-7" style={{ padding: '1.25rem' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <Eyebrow>Attack status</Eyebrow>
        <Chip color={status.color} bg={status.bg}>{status.text}</Chip>
      </div>
      <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
        <b className="stat-num text-white">{week.attackers.length}</b> of <b className="stat-num text-white">{week.eligible.length}</b> on target · a majority needs <b className="stat-num text-white">{week.majority}</b>
      </p>
      <SegmentBar
        count={week.eligible.length}
        filled={week.attackers.length}
        mark={week.majority}
        color={week.landed ? 'var(--success)' : 'var(--accent)'}
        label={`${week.attackers.length} of ${week.majority} attackers needed`}
      />
      <p className="text-[13px] mt-4" style={{ color: 'var(--text-2)' }}>
        <b className="stat-num" style={{ color: week.landed ? 'var(--success)' : 'var(--text-1)' }}>{week.locked}</b> current damage · <b className="stat-num text-white">{week.possible}</b> max damage
      </p>
      <SegmentBar
        count={Math.min(week.possible, DAMAGE_SEGMENTS)}
        filled={week.possible ? Math.round((week.locked / week.possible) * Math.min(week.possible, DAMAGE_SEGMENTS)) : 0}
        color={week.landed ? 'var(--success)' : 'var(--accent)'}
        label={`${week.locked} of ${week.possible} max damage`}
      />
      {week.attackers.length > 0 && (
        <div className="mt-4">
          <Eyebrow>Attacking</Eyebrow>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {week.attackers.map(f => (
              <span key={f.athlete_id} className="inline-flex items-center gap-1.5 rounded-md text-[12px]" style={{ background: 'var(--surface-2)', padding: '4px 8px 4px 4px', color: 'var(--text-1)' }}>
                <WeaponSprite tier={f.tier} size={18} /> {firstName(f.name)} <span className="font-mono text-[11px]" style={{ color: 'var(--accent)' }}>{f.power}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {!week.landed && pending.length > 0 && (
        <p className="text-[12px] mt-3" style={{ color: 'var(--text-2)' }}>
          <span style={{ color: 'var(--accent)' }}>Still in reach:</span> {rallyNames(pending)} · {plural(state.daysLeft, 'day')} left
        </p>
      )}
    </div>
  )
}

function WeekPips({ raid }: { raid: RaidSummary }) {
  return (
    <div className="flex gap-1.5 mt-3">
      {Array.from({ length: RAID_WEEKS }, (_, i) => {
        const w: RaidWeekResult | undefined = raid.weeks[i]
        const done = w && !w.open
        const color = !done ? 'var(--text-muted)' : w.landed ? 'var(--success)' : 'var(--error)'
        return (
          <div key={i} className="flex-1 rounded-md text-center" style={{ background: 'var(--surface-2)', padding: '6px 4px', border: `1px solid ${w?.open ? 'var(--accent)' : 'transparent'}` }}>
            <p className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Wk {i + 1}</p>
            <p className="stat-num font-bold text-[13px] mt-0.5" style={{ color }}>{!w ? '–' : w.open ? '…' : w.landed ? w.damage : '✕'}</p>
          </div>
        )
      })}
    </div>
  )
}

function ReportCard({ report, view }: { report: RaidReport | null; view: RaidView }) {
  const raid = view.state.raid
  if (!report) {
    return (
      <div className="card fade-up col-span-12 md:col-span-5" style={{ padding: '1.25rem' }}>
        <Eyebrow>Last week</Eyebrow>
        <p className="text-[13px] mt-2" style={{ color: 'var(--text-2)' }}>No battle yet. The first recap lands {day(addDays(view.state.firstRaidStart, 7))}.</p>
        {raid && <WeekPips raid={raid} />}
        <RaidStats view={view} />
      </div>
    )
  }
  const { week, shame } = report
  const ended = report.raid.status !== 'active' && report.raidWeek === RAID_WEEKS
  const slainNow = report.raid.slainWeek === report.raidWeek
  return (
    <div className="card fade-up col-span-12 md:col-span-5" style={{ padding: '1.25rem' }}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Last week · raid #{report.raid.number} wk {report.raidWeek}</Eyebrow>
        {week.provisional && <Chip color="var(--warning)" bg="var(--warning-bg)">Provisional</Chip>}
      </div>
      <p className="font-display font-bold uppercase leading-none mt-2" style={{ fontSize: 20, color: week.landed ? 'var(--success)' : 'var(--error)' }}>{attackHeadline(week)}</p>
      {slainNow && <p className="text-[13px] mt-1.5" style={{ color: 'var(--accent)' }}>The {report.raid.boss.name} fell!</p>}
      {ended && report.raid.status === 'escaped' && (
        <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-2)' }}>The {report.raid.boss.name} escaped: <i>&ldquo;{report.taunt}&rdquo;</i></p>
      )}
      {week.mvp && (
        <div className="flex items-center gap-2.5 mt-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', padding: '8px 10px' }}>
          <Avatar name={week.mvp.name} pic={view.members[week.mvp.athlete_id]?.pic ?? null} size={8} />
          <div className="flex-1 min-w-0">
            <Eyebrow color="var(--accent)">MVP</Eyebrow>
            <p className="text-[13px] font-semibold text-white truncate">{firstName(week.mvp.name)} · {week.mvp.power} dmg</p>
          </div>
          <WeaponSprite tier={week.mvp.tier} size={28} />
        </div>
      )}
      {shame.entries.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {shame.entries.map(e => (
            <div key={e.athlete_id} className="flex gap-2.5">
              <Avatar name={e.name} pic={view.members[e.athlete_id]?.pic ?? null} size={7} />
              <div className="min-w-0">
                <p className="text-[13px] text-white leading-snug">{e.line}</p>
                <p className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--accent)' }}>{e.wayBack}</p>
              </div>
            </div>
          ))}
          {shame.overflow > 0 && <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>+{shame.overflow} others</p>}
        </div>
      )}
      <WeekPips raid={raid && !ended ? raid : report.raid} />
      <RaidStats view={view} />
    </div>
  )
}

function RosterRow({ r, pic, me }: { r: RaidRosterEntry; pic: string | null; me: boolean }) {
  const faded = r.role !== 'fighting'
  const chip = r.role === 'dormant' ? { text: 'Dormant', color: 'var(--text-muted)', bg: 'var(--surface-2)' }
    : r.role === 'new' ? { text: 'Next week', color: 'var(--text-2)', bg: 'var(--surface-2)' }
    : r.on ? { text: 'Attacking ✓', color: 'var(--success)', bg: 'var(--success-bg)' }
    : { text: `${plural(r.needed, 'run')} to go`, color: 'var(--accent)', bg: 'var(--accent-muted)' }
  return (
    <div className="flex items-center gap-2.5 sm:gap-3 py-2.5" style={{ borderTop: '1px solid var(--border)', opacity: faded ? 0.5 : 1 }}>
      <Avatar name={r.name} pic={pic} size={8} />
      <div className="shrink-0 rounded flex items-center justify-center" style={{ width: 34, height: 34, background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
        <WeaponSprite tier={r.tier} size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white truncate">{firstName(r.name)}{me && <span className="font-normal" style={{ color: 'var(--text-muted)' }}> (you)</span>}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--text-2)' }}>
          ATK {r.tier.power}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Chip color={chip.color} bg={chip.bg}>{chip.text}</Chip>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5" style={{ width: 48 }} role="img" aria-label={`${r.runs} of ${r.target} runs this week`}>
            {Array.from({ length: r.target }, (_, i) => {
              const done = r.on || i < r.runs
              const fill = r.on ? 'var(--success)' : done ? 'var(--accent)' : 'var(--surface-3)'
              return <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: fill, border: `1px solid ${done ? fill : 'var(--border)'}` }} />
            })}
          </div>
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-2)' }}>{r.runs}/{r.target}</span>
        </div>
      </div>
    </div>
  )
}

function Roster({ view, myAthleteId }: { view: RaidView; myAthleteId: number }) {
  return (
    <div className="card fade-up col-span-12" style={{ padding: '1.25rem' }}>
      <div className="flex items-center justify-between mb-2">
        <Eyebrow>The party</Eyebrow>
        <Eyebrow>Runs this week</Eyebrow>
      </div>
      <div>
        {view.state.roster.map(r => (
          <RosterRow key={r.athlete_id} r={r} pic={view.members[r.athlete_id]?.pic ?? null} me={r.athlete_id === myAthleteId} />
        ))}
      </div>
    </div>
  )
}

function ShareCards({ view }: { view: RaidView }) {
  const { state } = view
  const base = `/api/groups/${view.groupId}/raid/card`
  const version = `${state.week}-${state.thisWeek.attackers.length}`
  const cards: Array<{ kind: 'report' | 'rally'; title: string; ready: boolean }> = [
    { kind: 'rally', title: state.raid ? 'This week' : 'Incoming boss', ready: true },
    { kind: 'report', title: 'Last week recap', ready: view.report != null },
  ]
  // The recap leads on Monday and Tuesday; this week's card the rest of the week.
  if (state.daysLeft >= 6) cards.reverse()

  return (
    <div className="card fade-up col-span-12" style={{ padding: '1.25rem' }}>
      <Eyebrow>Share cards</Eyebrow>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        {cards.map(card => (
          <div key={card.kind} className="rounded-lg flex flex-col" style={{ background: 'var(--surface-2)', padding: 10 }}>
            {card.ready ? (
              <img
                src={`${base}?kind=${card.kind}&v=${version}`}
                alt={`${card.title} card`}
                loading="lazy"
                className="w-full rounded-md"
                style={{ aspectRatio: '4 / 5', background: 'var(--surface-3)', border: '1px solid var(--border)' }}
              />
            ) : (
              <div className="w-full rounded-md flex items-center justify-center text-center px-6" style={{ aspectRatio: '4 / 5', background: 'var(--surface-3)', border: '1px dashed var(--border)' }}>
                <p className="font-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  First recap {day(addDays(state.firstRaidStart, 7))}
                </p>
              </div>
            )}
            <p className="text-[13px] font-semibold text-white mt-2.5 mb-2">{card.title}</p>
            {card.ready && (
              <ShareCardButton
                url={`${base}?kind=${card.kind}`}
                filename={`boss-raid-${card.kind}-${state.week}.png`}
                text={shareText(state, card.kind)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Rules() {
  return (
    <details className="card fade-up col-span-12 group" style={{ padding: '1rem 1.25rem' }}>
      <summary className="cursor-pointer list-none flex items-center justify-between">
        <Eyebrow>How the raid works</Eyebrow>
        <span className="font-mono text-[11px] group-open:rotate-45 transition-transform" style={{ color: 'var(--text-muted)' }}>+</span>
      </summary>
      <ul className="text-[13px] mt-3 space-y-1.5 list-disc pl-4" style={{ color: 'var(--text-2)' }}>
        <li>Each boss lasts {RAID_WEEKS} weeks (Mon–Sun). Its HP is set the week before it arrives: {Math.round(HP_FACTOR * 100)}% of the max damage the full party could deal across the {RAID_WEEKS} weeks.</li>
        <li>Hit your weekly target to join the attack. It only lands if a majority of active members hit their targets.</li>
        <li>When it lands, every attacker deals their weapon&apos;s power (after this week&apos;s level up). Top damage is MVP.</li>
        <li>Miss your target and your weapon drops a level. Hit it the next week to win it back.</li>
        <li>Members with no runs in 8 weeks are dormant: they don&apos;t attack and don&apos;t block. New members join the fight the week after they join.</li>
      </ul>
    </details>
  )
}

export function RaidSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-2 sm:gap-3" aria-busy="true">
      {[180, 200, 200, 240].map((h, i) => (
        <div key={i} className={`card col-span-12 ${i === 1 ? 'md:col-span-7' : i === 2 ? 'md:col-span-5' : ''} animate-pulse`} style={{ height: h }} />
      ))}
    </div>
  )
}

/** The group's Boss Raid tab: the boss, this week's attack, last week's battle, the party and share cards. */
export default function GroupRaidTab({ groupId, myAthleteId }: { groupId: string; myAthleteId: number }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/groups/${groupId}/raid`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(data => { if (!cancelled) setLoad(data.enabled ? { status: 'ready', view: data.view } : { status: 'off' }) })
      .catch(() => { if (!cancelled) setLoad({ status: 'error' }) })
    return () => { cancelled = true }
  }, [groupId])

  if (load.status === 'loading') return <RaidSkeleton />
  if (load.status !== 'ready') {
    return (
      <div className="card fade-up" style={{ padding: '1.25rem' }}>
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          {load.status === 'off' ? "Boss Raid isn't switched on yet." : "Couldn't load the raid. Try again shortly."}
        </p>
      </div>
    )
  }
  const { view } = load
  return (
    <div className="grid grid-cols-12 gap-2 sm:gap-3">
      <BossHero view={view} />
      <AttackCard view={view} />
      <ReportCard report={view.report} view={view} />
      <Roster view={view} myAthleteId={myAthleteId} />
      <ShareCards view={view} />
      <Rules />
    </div>
  )
}
