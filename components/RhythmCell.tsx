import Link from 'next/link'
import { FADE_MISSES, FADE_WINDOW_WEEKS, tierNumber, type RhythmResult } from '@/lib/rhythm'
import WeaponSprite from '@/components/WeaponSprite'
import StreakFlame from '@/components/StreakFlame'

const LABEL = 'font-mono text-[10px] uppercase tracking-widest'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One line under the target bar, only when something needs attention this week. */
function note(r: RhythmResult): { text: string; color: string } | null {
  switch (r.status) {
    case 'at_risk': return { text: `At risk: ${plural(r.thisWeek.needed, 'run')} in ${plural(r.thisWeek.daysLeft, 'day')}`, color: 'var(--warning)' }
    case 'redeem': return { text: `Hit your target this week to win back your ${r.weapon.redeemTier?.name ?? 'weapon'}`, color: 'var(--warning)' }
    case 'fade': return { text: `Fading: missed ${FADE_MISSES} of your last ${FADE_WINDOW_WEEKS} weeks`, color: 'var(--error)' }
    default: return null
  }
}

/** The dashboard's Rhythm card: level, attack power, streak, this week against the target, and progress to the next weapon. */
export default function RhythmCell({ rhythm }: { rhythm: RhythmResult }) {
  const { weapon, thisWeek, target } = rhythm
  const level = tierNumber(weapon.tier)
  const hit = thisWeek.runs >= target
  const attention = note(rhythm)
  const stats: Array<[string, string, string]> = [
    ['Level', `${level}`, weapon.tier.name],
    ['Attack', `${weapon.tier.power}`, 'power'],
  ]

  return (
    <div className="card fade-up mb-3" style={{ padding: '1.25rem' }}>
      <div className="flex items-center justify-between mb-4" style={{ minHeight: 24 }}>
        <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Boss Raid</p>
        {weapon.leveledUp && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent)', padding: '4px 8px', borderRadius: 4 }}>
            ▲ Level up!
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <div
          className="shrink-0 rounded-lg flex items-center justify-center"
          style={{ width: 76, height: 76, background: 'var(--surface-3)', border: `1px solid ${weapon.leveledUp ? 'var(--accent)' : 'var(--border)'}` }}
        >
          <WeaponSprite tier={weapon.tier} size={52} />
        </div>
        <div className="grid grid-cols-3 gap-2 flex-1 min-w-0">
          {stats.map(([name, value, sub]) => (
            <Link key={name} href="/groups?tab=raid" aria-label={`${name} ${value}: open the Raid tab`} className="rounded-lg min-w-0 block border border-transparent hover:border-[var(--accent)] transition-colors" style={{ background: 'var(--surface-2)', padding: '8px 10px' }}>
              <p className={LABEL} style={{ color: 'var(--text-muted)' }}>{name}</p>
              <div className="stat-num text-white font-bold leading-none mt-1.5" style={{ fontSize: 26 }}>{value}</div>
              <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-2)' }}>{sub}</p>
            </Link>
          ))}
          <div className="rounded-lg min-w-0 border border-transparent" style={{ background: 'var(--surface-2)', padding: '8px 10px' }}>
            <p className={LABEL} style={{ color: 'var(--text-muted)' }}>Streak</p>
            <div className="mt-1"><StreakFlame weeks={rhythm.streak} size={30} /></div>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-2)' }}>{rhythm.streak === 1 ? 'week' : 'weeks'}</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <p className={LABEL} style={{ color: 'var(--text-muted)' }}>This week</p>
          <p className="text-[12px]" style={{ color: hit ? 'var(--success)' : 'var(--text-2)' }}>
            <b className="stat-num text-white">{thisWeek.runs}</b> done · target <b className="stat-num text-white">{target}</b> {target === 1 ? 'run' : 'runs'}
            {hit ? ' ✓' : ` · ${thisWeek.needed} to go`}
          </p>
        </div>
        <div className="flex gap-2" role="img" aria-label={`${thisWeek.runs} of ${target} target runs this week`}>
          {Array.from({ length: target }, (_, i) => {
            const done = hit || i < thisWeek.runs
            const fill = hit ? 'var(--success)' : done ? 'var(--accent)' : 'var(--surface-3)'
            return <div key={i} style={{ flex: 1, height: 8, borderRadius: 2, background: fill, border: `1px solid ${done ? fill : 'var(--border)'}` }} />
          })}
        </div>
        {attention && <p className="text-[12px] mt-1.5" style={{ color: attention.color }}>{attention.text}</p>}
      </div>

      <div className="mt-4 pt-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--border)' }}>
        {weapon.nextTier ? (
          <>
            <p className={LABEL} style={{ color: 'var(--text-muted)' }}>Next level</p>
            <div className="flex gap-1 flex-1" role="img" aria-label={`${weapon.tierWeeksDone} of ${weapon.tierWeeksTotal} weeks on target toward level ${level + 1}`}>
              {Array.from({ length: weapon.tierWeeksTotal }, (_, i) => (
                <div key={i} style={{ flex: 1, height: 8, borderRadius: 2, background: i < weapon.tierWeeksDone ? 'var(--accent)' : 'var(--surface-3)', border: `1px solid ${i < weapon.tierWeeksDone ? 'var(--accent)' : 'var(--border)'}` }} />
              ))}
            </div>
            <span className="font-mono text-[11px] shrink-0" style={{ color: 'var(--text-2)' }}>
              {weapon.tierWeeksDone}/{weapon.tierWeeksTotal} wks
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="rounded flex items-center justify-center" style={{ width: 26, height: 26, background: 'var(--surface-3)', border: '1px dashed var(--accent)' }}>
                <WeaponSprite tier={weapon.nextTier} size={18} />
              </div>
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-1)' }}>Lv {level + 1}</span>
            </div>
          </>
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Max level reached</p>
        )}
      </div>
    </div>
  )
}
