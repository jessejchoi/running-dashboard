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
          <h1 className="font-display font-extrabold text-5xl mb-2">
            <span className="text-[#f97316]">RUN</span><span className="text-white/70">DASH</span>
          </h1>
          <p className="text-[#6b7280] text-sm">Your personal running dashboard.</p>
        </div>

        {/* Card */}
        <div className="card space-y-5">
          <div>
            <h2 className="font-display font-bold text-lg mb-0.5">Let's get started</h2>
            <p className="text-[#6b7280] text-xs">Connect your Strava account to get started. Read-only access — no posting or data modification.</p>
          </div>

          <a
            href="/api/auth/strava"
            className="w-full flex items-center justify-center gap-2.5 bg-[#f97316] hover:bg-[#ea580c] text-white font-bold py-3.5 rounded-xl transition-colors text-sm"
          >
            <StravaLogo />
            Continue with Strava
          </a>

          <p className="text-[#4b5563] text-[11px] text-center">
            By connecting, you agree to Strava's terms of service.
          </p>
        </div>
      </div>
    </div>
  )
}
