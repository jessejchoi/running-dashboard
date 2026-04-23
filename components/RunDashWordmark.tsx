type RunDashWordmarkProps = {
  markClassName?: string
  textClassName?: string
}

export default function RunDashWordmark({
  markClassName = 'h-7 w-auto',
  textClassName = 'text-xl',
}: RunDashWordmarkProps) {
  return (
    <span className={`font-display font-bold uppercase tracking-tight inline-flex items-center ${textClassName}`}>
      <svg
        viewBox="52 58 78 64"
        aria-hidden="true"
        className={`mr-2 shrink-0 overflow-visible ${markClassName}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="rundash-wordmark-glow" x="-24" y="-24" width="228" height="228" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M60 66 L98.8 89.2 L98.8 90.8 L60 114"
          fill="none"
          stroke="#f97316"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeMiterlimit="10"
          filter="url(#rundash-wordmark-glow)"
        />
        <path
          d="M80 66 L120.8 89.2 L120.8 90.8 L80 114"
          fill="none"
          stroke="#a3a3a3"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeMiterlimit="10"
          filter="url(#rundash-wordmark-glow)"
        />
      </svg>
      <span style={{ color: 'var(--orange)' }}>RUN</span>
      <span className="text-white/50">DASH</span>
    </span>
  )
}
