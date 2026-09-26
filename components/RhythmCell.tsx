import { addDays } from '@/lib/calendar'
import { FADE_MISSES, FADE_WINDOW_WEEKS, type RhythmResult, type RhythmStatus } from '@/lib/rhythm'
import WeaponSprite from '@/components/WeaponSprite'

const STATUS: Record<RhythmStatus, { label: string; color: string; bg: string }> = {
  on: { label: 'Target hit', color: 'var(--success)', bg: 'var(--success-bg)' },
  building: { label: 'On pace', color: 'var(--text-2)', bg: 'var(--surface-2)' },
  at_risk: { label: 'At risk', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  fade: { label: 'Fading', color: 'var(--error)', bg: 'var(--error-bg)' },
  redeem: { label: 'Redeem', color: 'var(--warning)', bg: 'var(--warning-bg)' },
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function statusLine(r: RhythmResult): string {
  const { needed, daysLeft } = r.thisWeek
  const runs = (n: number) => `${n} run${n === 1 ? '' : 's'}`
  switch (r.status) {
    case 'on': return 'Done for the week: your streak and weapon level up'
    case 'at_risk': return `Need ${runs(needed)} in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
    case 'fade': return `Missed ${FADE_MISSES} of your last ${FADE_WINDOW_WEEKS} weeks · ${runs(needed)} to go`
    case 'redeem': return `Hit ${r.target} this week to get your ${r.weapon.redeemTier?.name ?? 'weapon'} back`
    case 'building': return `${runs(needed)} to go · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
  }
}

/** The dashboard's Rhythm card: this week's runs against the target, and the weapon they earn. */
export default function RhythmCell({ rhythm, today }: { rhythm: RhythmResult; today: string }) {
  const status = STATUS[rhythm.status]
  const { weapon } = rhythm
  return (
    <div className="card fade-up mb-3" style={{ padding: '1.25rem' }}>
      <div className="flex items-start justify-between mb-4">
        <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Rhythm</p>
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Season wk {rhythm.seasonWeek}
        </p>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <div className="shrink-0 flex flex-col items-center gap-1.5">
          <div className="rounded-lg flex items-center justify-center" style={{ width: 72, height: 72, background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
            <WeaponSprite tier={weapon.tier} size={48} />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: weapon.level ? 'var(--accent)' : 'var(--text-muted)' }}>
            {weapon.tier.name}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="stat-num font-bold leading-none text-white" style={{ fontSize: 'clamp(32px, 5vw, 42px)' }}>
              {rhythm.thisWeek.runs}/{rhythm.target}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>runs this week</span>
            <span
              className="font-mono text-[10px] font-bold uppercase tracking-wider"
              style={{ color: status.color, background: status.bg, padding: '4px 8px', borderRadius: 4 }}
            >
              {status.label}
            </span>
          </div>
          <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-2)' }}>{statusLine(rhythm)}</p>

          <div className="flex gap-1 mt-3" role="group" aria-label="Runs this week">
            {DAY_LETTERS.map((letter, i) => {
              const day = addDays(rhythm.week, i)
              const ran = rhythm.thisWeek.runDays.includes(day)
              const isToday = day === today
              return (
                <div
                  key={day}
                  title={day}
                  aria-label={`${day}: ${ran ? 'ran' : day > today ? 'upcoming' : 'no run'}`}
                  className="font-mono text-[10px] flex items-center justify-center"
                  style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: ran ? 'var(--accent)' : 'var(--surface-3)',
                    color: ran ? 'var(--bg)' : 'var(--text-muted)',
                    opacity: !ran && day > today ? 0.45 : 1,
                    border: `1px solid ${isToday && !ran ? 'var(--accent)' : ran ? 'var(--accent)' : 'var(--border)'}`,
                    fontWeight: ran ? 700 : 400,
                  }}
                >
                  {letter}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          <span>Streak <span className="text-white font-bold">{rhythm.streak}w</span></span>
          <span>
            {weapon.nextTier
              ? <>{weapon.weeksToNext} wk{weapon.weeksToNext === 1 ? '' : 's'} → <span style={{ color: 'var(--text-2)' }}>{weapon.nextTier.name}</span></>
              : 'Max tier'}
          </span>
          <span title="Your target is your 6-week average, rounded (rounded up while you're below it)">
            6-wk avg {rhythm.avgRuns.toFixed(1)}
          </span>
        </div>
        {rhythm.history.length > 0 && (
          <div className="flex gap-0.5" role="group" aria-label="Recent weeks">
            {rhythm.history.map(w => (
              <div
                key={w.week}
                title={`${w.week}: ${w.runs}/${w.target}`}
                aria-label={`Week of ${w.week}: ${w.runs} of ${w.target} runs`}
                style={{
                  width: 8, height: 14, borderRadius: 2,
                  background: w.state === 'on' ? 'var(--accent)' : w.state === 'short' ? 'var(--warning-bg)' : 'var(--surface-3)',
                  border: `1px solid ${w.state === 'on' ? 'var(--accent)' : w.state === 'short' ? 'var(--warning)' : 'var(--border)'}`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
