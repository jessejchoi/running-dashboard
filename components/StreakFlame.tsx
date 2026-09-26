/** A streak count inside a flame, like Strava's streak badge. Grey while the streak is 0. */
export default function StreakFlame({ weeks, size = 44 }: { weeks: number; size?: number }) {
  const lit = weeks > 0
  const digits = String(weeks).length
  const fontSize = size * (digits >= 3 ? 0.3 : digits === 2 ? 0.38 : 0.44)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 1.17 }} role="img" aria-label={`${weeks}-week streak`}>
      <svg width={size} height={size * 1.17} viewBox="0 0 48 56" aria-hidden="true">
        <path
          d="M24 2C29 11 43 19 43 36C43 48 34.5 55 24 55S5 48 5 36C5 27.5 9.5 21.5 13.5 17.5C13.5 23.5 16 27.5 19.5 28.5C17.5 19.5 19.5 10 24 2Z"
          fill={lit ? 'var(--accent)' : 'var(--surface-3)'}
          stroke={lit ? 'var(--accent)' : 'var(--border)'}
          strokeWidth={lit ? 0 : 1.5}
        />
      </svg>
      <span
        className="stat-num absolute inset-x-0 text-center font-bold leading-none"
        style={{ bottom: size * 0.2, fontSize, color: lit ? '#fff' : 'var(--text-muted)' }}
      >
        {weeks}
      </span>
    </div>
  )
}
