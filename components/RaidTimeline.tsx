'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, X } from 'lucide-react'
import { RAID_WEEKS, type RaidSummary, type RaidWeekResult } from '@/lib/raid'
import { attackHeadline, bossTaunt, firstName, shameList, type ShameEntry } from '@/lib/raidCopy'
import type { RaidView } from '@/lib/raidData'
import { Avatar } from '@/components/GroupShared'
import WeaponSprite, { BossSprite } from '@/components/WeaponSprite'
import { Chip, Eyebrow, HpBar, HpReadout, WeekPips, day } from '@/components/raidUi'

/*
 * The top of the Raid tab: a short scrolling timeline.
 *
 *   ▲ older raids          small result slivers (tap for details)
 *   ─ previous raid        peeks in above the current boss
 *   █ current boss         the main card (opens scrolled here)
 *   ─ next boss            only in a raid's final week
 */

/** How much of the previous raid's sliver shows above the current boss on load. */
const PEEK_PX = 40

type Detail = { raid: RaidSummary; focus: string | null }

const statusChip = (raid: RaidSummary) =>
  raid.status === 'slain' ? { text: 'Slain', color: 'var(--accent)', bg: 'var(--accent-muted)' }
  : raid.status === 'escaped' ? { text: 'Escaped', color: 'var(--error)', bg: 'var(--error-bg)' }
  : { text: 'In progress', color: 'var(--text-2)', bg: 'var(--surface-3)' }

function outcome(raid: RaidSummary): string {
  if (raid.status === 'slain') return `Slain in week ${raid.slainWeek} · ${raid.damage} dmg vs ${raid.hp} HP${raid.overkill > 0 ? ` · overkill ${raid.overkill}` : ''}`
  if (raid.status === 'escaped') return `Escaped with ${raid.hp - raid.damage} of ${raid.hp} HP left`
  return `${Math.max(0, raid.hp - raid.damage)} of ${raid.hp} HP left`
}

/** A finished raid, one line: tap for the week-by-week story. */
function ResultSliver({ raid, onOpen }: { raid: RaidSummary; onOpen: () => void }) {
  const chip = statusChip(raid)
  const provisional = raid.weeks[raid.weeks.length - 1]?.provisional
  return (
    <button type="button" onClick={onOpen} className="w-full text-left flex items-center gap-3 rounded-lg transition-colors hover:border-[#383838]"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '8px 12px', minHeight: 52 }}>
      <div style={{ opacity: raid.status === 'slain' ? 0.45 : 0.8 }}><BossSprite boss={raid.boss} size={32} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white truncate">
          <span className="font-mono text-[10px] font-normal uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>#{raid.number} </span>
          {raid.boss.name}
        </p>
        <p className="text-[12px] truncate mt-0.5" style={{ color: 'var(--text-2)' }}>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: chip.color }}>
            {raid.status === 'slain' ? `Slain wk ${raid.slainWeek}` : chip.text}
          </span>
          {' · '}{raid.damage}/{raid.hp} dmg{raid.mvp && <> · MVP <span className="text-white">{firstName(raid.mvp.name)}</span></>}
          {provisional && <span style={{ color: 'var(--warning)' }}> · provisional</span>}
        </p>
      </div>
      <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
    </button>
  )
}

function NextSliver({ view }: { view: RaidView }) {
  const next = view.state.upNext!
  return (
    <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px dashed var(--accent)', padding: '8px 12px', minHeight: 52 }}>
      <BossSprite boss={next.boss} size={32} />
      <div className="flex-1 min-w-0">
        <Eyebrow color="var(--accent)">Next up</Eyebrow>
        <p className="text-[13px] font-semibold text-white truncate">{next.boss.name}</p>
      </div>
      <p className="font-mono text-[11px] text-right shrink-0" style={{ color: 'var(--text-2)' }}>
        <b className="text-white">{next.hp}</b> HP<br />arrives {day(next.start)}
      </p>
    </div>
  )
}

/** The current boss (or the incoming one before the first raid). */
function BossCard({ view, onOpen }: { view: RaidView; onOpen: (d: Detail) => void }) {
  const { state } = view
  const raid = state.raid
  const boss = raid?.boss ?? state.nextBoss
  const hpLeft = raid ? Math.max(0, raid.hp - raid.damage) : 0
  const slain = raid?.status === 'slain'
  const provisional = raid?.hpProvisional || state.thisWeek.provisional
  const lastWeek = raid?.weeks.filter(w => !w.open).at(-1) ?? null

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
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
      {raid && lastWeek && (
        <button type="button" onClick={() => onOpen({ raid, focus: lastWeek.week })}
          className="w-full text-left flex items-center gap-2 mt-4 pt-3 transition-colors"
          style={{ borderTop: '1px solid var(--border)', minHeight: 44 }}>
          <Eyebrow>Last week</Eyebrow>
          <span className="text-[13px] font-semibold flex-1 truncate" style={{ color: lastWeek.landed ? 'var(--success)' : 'var(--error)' }}>
            {attackHeadline(lastWeek)}
            {lastWeek.mvp && <span className="font-normal" style={{ color: 'var(--text-2)' }}> · MVP {firstName(lastWeek.mvp.name)}</span>}
          </span>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      )}
    </div>
  )
}

function WeekStory({ week, index, raid, roasts, current, view }: {
  week: RaidWeekResult; index: number; raid: RaidSummary; roasts: { entries: ShameEntry[]; overflow: number }; current: boolean; view: RaidView
}) {
  const chip = week.open ? { text: 'In progress', color: 'var(--text-2)', bg: 'var(--surface-3)' }
    : week.landed ? { text: `Landed · ${week.damage} dmg`, color: 'var(--success)', bg: 'var(--success-bg)' }
    : { text: 'Failed', color: 'var(--error)', bg: 'var(--error-bg)' }
  const slainHere = raid.slainWeek === index + 1
  return (
    <section id={`raid-week-${week.week}`} className="rounded-lg" style={{ background: 'var(--surface-2)', padding: '10px 12px', border: `1px solid ${current ? 'var(--accent)' : 'transparent'}` }}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Week {index + 1} · {day(week.week)}</Eyebrow>
        <div className="flex gap-1.5">
          {week.provisional && <Chip color="var(--warning)" bg="var(--warning-bg)">Provisional</Chip>}
          <Chip color={chip.color} bg={chip.bg}>{chip.text}</Chip>
        </div>
      </div>
      {slainHere && <p className="text-[13px] mt-1.5" style={{ color: 'var(--accent)' }}>The {raid.boss.name} fell this week!</p>}
      {week.open ? (
        <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-2)' }}>{week.attackers.length} of {week.eligible.length} on target so far · {week.majority} needed</p>
      ) : (
        <>
          <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-2)' }}>{week.attackers.length} of {week.eligible.length} on target · {week.majority} needed</p>
          {week.mvp && (
            <div className="flex items-center gap-2 mt-2">
              <Avatar name={week.mvp.name} pic={view.members[week.mvp.athlete_id]?.pic ?? null} size={6} />
              <p className="text-[13px] flex-1 min-w-0 truncate"><span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--accent)' }}>MVP </span><span className="text-white font-semibold">{firstName(week.mvp.name)}</span> · {week.mvp.power} dmg</p>
              <WeaponSprite tier={week.mvp.tier} size={20} />
            </div>
          )}
          {roasts.entries.map(e => (
            <div key={e.athlete_id} className="flex gap-2 mt-2">
              <Avatar name={e.name} pic={view.members[e.athlete_id]?.pic ?? null} size={6} />
              <div className="min-w-0">
                <p className="text-[13px] text-white leading-snug">{e.line}</p>
                {e.wayBack && <p className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--accent)' }}>{e.wayBack}</p>}
              </div>
            </div>
          ))}
          {roasts.overflow > 0 && <p className="font-mono text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>+{roasts.overflow} others</p>}
        </>
      )}
    </section>
  )
}

/** Every finished raid week, oldest first: the nudge rule looks back across raids. */
function useFinishedWeeks(view: RaidView): RaidWeekResult[] {
  return useMemo(() => {
    const raids = [...view.state.history].reverse().concat(view.state.raid ? [view.state.raid] : [])
    return raids.flatMap(r => r.weeks).filter(w => !w.open)
  }, [view])
}

/** The pop-up for one raid: outcome, raid MVP, and each week's result with its MVP and roasts. */
function RaidDetailModal({ detail, view, onClose }: { detail: Detail; view: RaidView; onClose: () => void }) {
  const { raid, focus } = detail
  const finished = useFinishedWeeks(view)
  const chip = statusChip(raid)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    if (focus) document.getElementById(`raid-week-${focus}`)?.scrollIntoView({ block: 'nearest' })
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, onClose])

  const roastsFor = (week: RaidWeekResult) => {
    // Last week's roasts come from the server, with a way back that's true today.
    if (view.report?.week.week === week.week) return view.report.shame
    const upTo = finished.filter(w => w.week <= week.week)
    const list = shameList(upTo, view.groupId, raid.boss)
    // Older weeks: the roast stands, but "hit your target this week" no longer applies.
    return { entries: list.entries.map(e => ({ ...e, wayBack: '' })), overflow: list.overflow }
  }

  return (
    <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="raid-detail-title" onClick={e => e.stopPropagation()}
        className="relative z-[9999] w-full sm:max-w-lg overflow-y-auto"
        style={{ maxHeight: '85vh', background: 'rgba(17,17,17,0.92)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, boxShadow: '0 8px 48px rgba(0,0,0,0.6)', padding: '1.25rem' }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2 right-2 flex items-center justify-center" style={{ width: 44, height: 44, color: 'var(--text-2)' }}>
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 pr-10">
          <div className="shrink-0 rounded-lg flex items-center justify-center" style={{ width: 64, height: 64, background: 'var(--surface-3)', border: '1px solid var(--border)', opacity: raid.status === 'slain' ? 0.5 : 1 }}>
            <BossSprite boss={raid.boss} size={52} />
          </div>
          <div className="min-w-0">
            <Eyebrow color="var(--accent)">Raid #{raid.number} · {day(raid.start)} – {day(raid.end)}</Eyebrow>
            <h3 id="raid-detail-title" className="font-display font-bold uppercase text-white leading-none mt-1" style={{ fontSize: 20 }}>{raid.boss.name}</h3>
            <div className="mt-1.5"><Chip color={chip.color} bg={chip.bg}>{chip.text}</Chip></div>
          </div>
        </div>
        <p className="text-[13px] mt-3" style={{ color: 'var(--text-1)' }}>{outcome(raid)}</p>
        {raid.status === 'escaped' && (
          <p className="text-[13px] mt-1 italic" style={{ color: 'var(--text-2)' }}>&ldquo;{bossTaunt(raid.boss, view.groupId, raid.index)}&rdquo;</p>
        )}
        {raid.mvp && (
          <div className="flex items-center gap-2.5 mt-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', padding: '8px 10px' }}>
            <Avatar name={raid.mvp.name} pic={view.members[raid.mvp.athlete_id]?.pic ?? null} size={8} />
            <div className="flex-1 min-w-0">
              <Eyebrow color="var(--accent)">Raid MVP</Eyebrow>
              <p className="text-[13px] font-semibold text-white truncate">{firstName(raid.mvp.name)} · {raid.mvp.damage} dmg</p>
            </div>
          </div>
        )}
        <div className="mt-3"><WeekPips raid={raid} /></div>
        <div className="mt-3 space-y-2">
          {raid.weeks.map((w, i) => (
            <WeekStory key={w.week} week={w} index={i} raid={raid} roasts={roastsFor(w)} current={w.week === focus} view={view} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** The scrolling timeline at the top of the Raid tab. */
export default function RaidTimeline({ view }: { view: RaidView }) {
  const { state } = view
  const [detail, setDetail] = useState<Detail | null>(null)
  const close = useCallback(() => setDetail(null), [])
  const scroller = useRef<HTMLDivElement>(null)
  const current = useRef<HTMLDivElement>(null)
  const past = [...state.history].reverse() // oldest at the top

  // Open on the current boss, with the previous raid's result peeking in above it.
  useLayoutEffect(() => {
    if (scroller.current && current.current) scroller.current.scrollTop = Math.max(0, current.current.offsetTop - PEEK_PX)
  }, [state.history.length])

  const raids = state.history.length + (state.raid ? 1 : 0)
  return (
    <div className="col-span-12 fade-up">
      <div className="flex items-center justify-between mb-2 px-1">
        <Eyebrow>Boss raid</Eyebrow>
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          <b className="text-white">{state.bossesSlain}</b> slain · <b className="text-white">{raids}</b> {raids === 1 ? 'raid' : 'raids'}
        </p>
      </div>
      <div ref={scroller} className="relative overflow-y-auto rounded-xl" style={{ maxHeight: 460, overscrollBehavior: 'contain' }}>
        <div className="space-y-2">
          {past.map(r => <ResultSliver key={r.index} raid={r} onOpen={() => setDetail({ raid: r, focus: r.weeks.at(-1)?.week ?? null })} />)}
          <div ref={current}><BossCard view={view} onOpen={setDetail} /></div>
          {state.upNext && <NextSliver view={view} />}
        </div>
      </div>
      {/* Portaled: the .fade-up transform above would otherwise trap position: fixed inside this card. */}
      {detail && createPortal(<RaidDetailModal detail={detail} view={view} onClose={close} />, document.body)}
    </div>
  )
}
