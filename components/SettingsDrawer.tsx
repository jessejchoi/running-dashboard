'use client'
import { useEffect, useState } from 'react'
import { X, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useUnit } from '@/lib/unit-context'
import type { DistanceUnit } from '@/lib/utils'

const STATUS_TAGS = ['Injured', 'Taking it easy', 'Milemaxxing', 'Peak week', 'Tapering', 'Base building']

interface Profile {
  display_name?: string
  age?: number | null
  gender?: string | null
  unit?: DistanceUnit
  weight_kg?: number | null
  max_hr?: number | null
  status_tag?: string | null
}

interface StravaData {
  display_name: string | null
  gender: string | null
  weight_kg: number | null
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsDrawer({ open, onClose }: Props) {
  const router = useRouter()
  const { setUnit } = useUnit()

  const [profile, setProfile] = useState<Profile>({})
  const [strava, setStrava] = useState<StravaData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Load settings when drawer opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/settings')
      .then(r => r.json())
      .then(({ profile: p, strava: s }) => {
        setStrava(s ?? null)
        // Pre-fill null DB fields with Strava data
        const merged: Profile = { ...(p ?? {}) }
        if (s) {
          if (!merged.display_name && s.display_name) merged.display_name = s.display_name
          if (!merged.gender && s.gender) merged.gender = s.gender
          if (!merged.weight_kg && s.weight_kg) merged.weight_kg = s.weight_kg
        }
        setProfile(merged)
      })
      .finally(() => setLoading(false))
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!res.ok) throw new Error('Save failed')
      // Update unit context immediately for instant client-side effect
      if (profile.unit) setUnit(profile.unit)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onClose()
        router.refresh()
      }, 1000)
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-[9999] w-full max-w-sm flex flex-col transition-transform duration-300 ease-in-out"
        style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)', transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-display font-bold text-base uppercase tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 transition-colors rounded-md"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
          {loading ? (
            <div className="text-[#6b7280] text-sm text-center py-12">Loading…</div>
          ) : (
            <>
              {/* ── Profile ───────────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Profile</h3>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>Display Name</label>
                    <input
                      type="text"
                      value={profile.display_name ?? ''}
                      onChange={e => set('display_name', e.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>Age</label>
                      <input
                        type="number"
                        value={profile.age ?? ''}
                        onChange={e => set('age', e.target.value ? Number(e.target.value) : null)}
                        placeholder="—"
                        min={1}
                        max={120}
                        className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>Gender</label>
                      <select
                        value={profile.gender ?? ''}
                        onChange={e => set('gender', e.target.value || null)}
                        className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                      >
                        <option value="">—</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                        <option value="X">Non-binary</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Training ──────────────────────────────────────── */}
              <section>
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Training</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>
                      Weight ({profile.unit === 'miles' ? 'lbs' : 'kg'})
                    </label>
                    <input
                      type="number"
                      value={
                        profile.weight_kg
                          ? profile.unit === 'miles'
                            ? +(profile.weight_kg * 2.20462).toFixed(1)
                            : profile.weight_kg
                          : ''
                      }
                      onChange={e => {
                        if (!e.target.value) { set('weight_kg', null); return }
                        const v = Number(e.target.value)
                        set('weight_kg', profile.unit === 'miles' ? v / 2.20462 : v)
                      }}
                      placeholder="—"
                      min={20}
                      max={700}
                      step={profile.unit === 'miles' ? 0.1 : 0.1}
                      className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>Max HR</label>
                    <input
                      type="number"
                      value={profile.max_hr ?? ''}
                      onChange={e => set('max_hr', e.target.value ? Number(e.target.value) : null)}
                      placeholder="—"
                      min={100}
                      max={220}
                      className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }} onFocus={e => (e.currentTarget.style.borderColor = 'var(--orange)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                  </div>
                </div>
              </section>

              {/* ── Status ───────────────────────────────────────── */}
              <section>
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Status</h3>
                <p className="text-xs mb-2.5" style={{ color: 'var(--text-muted)' }}>Visible to your group members.</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => set('status_tag', profile.status_tag === tag ? null : tag)}
                      className="px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors"
                      style={
                        profile.status_tag === tag
                          ? { background: 'var(--orange)', border: '1px solid var(--orange)', color: '#fff' }
                          : { background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-muted)' }
                      }
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {profile.status_tag && (
                  <button
                    onClick={() => set('status_tag', null)}
                    className="mt-2 text-xs transition-colors hover:text-white"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Clear status
                  </button>
                )}
              </section>

              {/* ── Strava ────────────────────────────────────────── */}
              <section>
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Strava</h3>
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#fc4c02' }} />
                    <span className="text-sm text-white truncate">{strava?.display_name ?? 'Connected'}</span>
                  </div>
                  <button
                    onClick={async () => {
                      setDisconnecting(true)
                      try {
                        await fetch('/api/auth/strava/disconnect', { method: 'POST' })
                        window.location.href = '/api/auth/strava'
                      } finally {
                        setDisconnecting(false)
                      }
                    }}
                    disabled={disconnecting}
                    className="text-xs font-bold shrink-0 ml-3 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'transparent' }}
                  >
                    {disconnecting ? 'Reconnecting…' : 'Reconnect'}
                  </button>
                </div>
                <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Reconnect if activities aren't syncing. Your data is preserved.
                </p>
              </section>

              {/* ── Preferences ───────────────────────────────────── */}
              <section>
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Preferences</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>Distance Unit</label>
                    <div className="flex gap-2">
                      {(['km', 'miles'] as DistanceUnit[]).map(u => (
                        <button
                          key={u}
                          onClick={() => set('unit', u)}
                          className="flex-1 py-2 rounded-md text-sm font-bold transition-colors"
                          style={
                            profile.unit === u || (!profile.unit && u === 'km')
                              ? { background: 'var(--orange)', border: '1px solid var(--orange)', color: '#fff' }
                              : { background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-muted)' }
                          }
                        >
                          {u === 'km' ? 'km' : 'miles'}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
            style={{ background: 'var(--orange)' }}
          >
            <Save size={14} />
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </>
  )
}
