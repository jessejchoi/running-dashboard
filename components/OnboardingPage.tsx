'use client'

const StravaLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
  </svg>
)

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm fade-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display font-extrabold text-5xl uppercase tracking-tight mb-2" style={{ letterSpacing: '-0.02em' }}>
            <span style={{ color: 'var(--orange)' }}>RUN</span><span className="text-white/50">DASH</span>
          </h1>
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Personal running dashboard</p>
        </div>

        {/* Card */}
        <div className="card space-y-5">
          <div>
            <h2 className="font-display font-bold text-base uppercase mb-1" style={{ letterSpacing: '0.02em' }}>Get started</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Connect your Strava account. Read-only access — no posting or data modification.</p>
          </div>

          <a
            href="/api/auth/strava"
            className="w-full flex items-center justify-center gap-2.5 text-white font-bold py-3.5 rounded-lg transition-colors text-sm"
            style={{ background: 'var(--orange)' }}
          >
            <StravaLogo />
            Continue with Strava
          </a>

          <p className="text-[11px] text-center" style={{ color: 'var(--text-3)' }}>
            By connecting, you agree to Strava's terms of service.
          </p>
        </div>
      </div>
    </div>
  )
}
