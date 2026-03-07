'use client'
import { useState } from 'react'

const StravaLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
  </svg>
)

export default function OnboardingPage() {
  const [name, setName]     = useState('')
  const [age, setAge]       = useState('')
  const [gender, setGender] = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    if (!name.trim()) { setError('Please enter your name'); return }
    setError('')
    setLoading(true)

    // Save profile via API, then redirect to Strava OAuth
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: name.trim(),
          age: age ? parseInt(age) : null,
          gender: gender || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save profile')
      // Redirect to Strava OAuth
      window.location.href = '/api/auth/strava'
    } catch (e: any) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

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

        {/* Form card */}
        <div className="card space-y-5">
          <div>
            <h2 className="font-display font-bold text-lg mb-0.5">Let's get started</h2>
            <p className="text-[#6b7280] text-xs">Tell us a bit about yourself, then connect your Strava.</p>
          </div>

          {/* Name */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">
              Display Name <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              placeholder="Jesse"
              autoFocus
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
            />
            <p className="text-[#4b5563] text-[11px] mt-1">This is how you'll appear in groups.</p>
          </div>

          {/* Age + Gender row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">
                Age <span className="text-[#4b5563] font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input
                type="number"
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="28"
                min={10}
                max={99}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] mb-1.5 block">
                Gender <span className="text-[#4b5563] font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-[#f97316] rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors appearance-none"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={loading || !name.trim()}
            className="w-full flex items-center justify-center gap-2.5 bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors text-sm"
          >
            <StravaLogo />
            {loading ? 'Redirecting…' : 'Continue with Strava'}
          </button>

          <p className="text-[#4b5563] text-[11px] text-center">
            Read-only access to your activities. No posting or data modification.
          </p>
        </div>
      </div>
    </div>
  )
}
