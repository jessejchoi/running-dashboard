import type { ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { RAID_WEEKS, type RaidSummary, type RaidWeekResult } from '@/lib/raid'

/* Small pieces shared by the Raid tab and its timeline. */

export const LABEL = 'font-mono text-[10px] uppercase tracking-widest'
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
export const day = (d: string) => format(parseISO(d), 'EEE MMM d')

export function Eyebrow({ children, color = 'var(--text-muted)' }: { children: ReactNode; color?: string }) {
  return <p className={LABEL} style={{ color }}>{children}</p>
}

export function Chip({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span className="font-mono text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color, background: bg, padding: '4px 8px', borderRadius: 4 }}>
      {children}
    </span>
  )
}

/** Remaining HP in orange, this week's locked damage as a lighter chunk. */
export function HpBar({ hp, remaining, chunk }: { hp: number; remaining: number; chunk: number }) {
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

export function HpReadout({ value, hp }: { value: number; hp: number }) {
  return (
    <p className="flex items-baseline gap-1.5 mb-1.5">
      <span className="stat-num font-bold text-white leading-none" style={{ fontSize: 32 }}>{value}</span>
      <span className="font-mono text-[12px]" style={{ color: 'var(--text-2)' }}>/ {hp} HP</span>
    </p>
  )
}

/** Damage per week across a raid: landed, failed, in progress, or still to come. */
export function WeekPips({ raid }: { raid: RaidSummary }) {
  return (
    <div className="flex gap-1.5">
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
