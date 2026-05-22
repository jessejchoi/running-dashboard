type RunDashWordmarkProps = {
  markClassName?: string
  textClassName?: string
}

// ── Pulse wordmark ─────────────────────────────────────────────────────
// Two square-capped chevrons forming a stride. The leading chevron is
// magenta (the runner — primary signal); the trailing one is muted (the
// trail). The slash between RUN and DASH echoes the mark.
export default function RunDashWordmark({
  markClassName = 'h-6 w-auto',
  textClassName = 'text-xl',
}: RunDashWordmarkProps) {
  return (
    <span className={`font-display font-bold uppercase tracking-tight inline-flex items-center ${textClassName}`} style={{ letterSpacing: '-0.02em' }}>
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={`mr-2 shrink-0 ${markClassName}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 5 L18 16 L6 27"
          fill="none"
          stroke="#ff1d6c"
          strokeWidth="4"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M14 5 L26 16 L14 27"
          fill="none"
          stroke="#6a6a6a"
          strokeWidth="4"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
      <span>RUN</span>
      <span style={{ color: 'var(--magenta)' }}>/</span>
      <span style={{ color: 'var(--fg-2)' }}>DASH</span>
    </span>
  )
}
