'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, RefreshCw, Users, Settings } from 'lucide-react'
import { useState, useTransition } from 'react'
import SettingsDrawer from './SettingsDrawer'

const navItems = [
  { href: '/',       label: 'Dashboard', icon: Activity },
  { href: '/groups', label: 'Group',     icon: Users },
]

export default function Nav() {
  const path = usePathname()
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  function handleNavClick(e: React.MouseEvent, href: string) {
    if (href === path) return
    e.preventDefault()
    setPendingHref(href)
    startTransition(() => {
      router.push(href)
    })
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sync-all', { method: 'POST' })
      const data = await res.json()
      const n = (data.newRuns ?? 0) + (data.detailsSynced ?? 0)
      const msg = n > 0 ? `${n} synced` : 'Up to date'
      setSyncMsg(msg)
      setSyncing(false)
      setTimeout(() => router.refresh(), 800)
    } catch {
      setSyncMsg('Error')
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  return (
    <>
      {/* ── Desktop top nav ───────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 hidden sm:block" style={{ background: 'rgba(8,8,8,0.85)', backdropFilter: 'blur(16px) saturate(180%)', WebkitBackdropFilter: 'blur(16px) saturate(180%)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <span className="font-display font-bold text-xl uppercase tracking-tight">
            <span style={{ color: 'var(--orange)' }}>RUN</span>
            <span className="text-white/50">DASH</span>
          </span>
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== '/' && path.startsWith(href)) || (href === '/groups' && path.startsWith('/group/'))
              const loading = pendingHref === href && isPending
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={true}
                  onClick={(e) => handleNavClick(e, href)}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150"
                  style={{
                    color: active || loading ? 'var(--orange)' : 'var(--text-muted)',
                    background: active || loading ? 'var(--accent-muted)' : 'transparent',
                    opacity: loading ? 0.75 : 1,
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-all disabled:opacity-50"
              style={{ color: syncMsg && !syncing ? 'var(--success)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : syncMsg ?? 'Sync Strava'}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 flex items-center justify-center rounded-md transition-all"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              title="Settings"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
        {isPending && (
          <div className="absolute bottom-0 left-0 h-[2px] animate-pulse" style={{ width: '40%', background: 'var(--orange)' }} />
        )}
      </nav>

      {/* ── Mobile top bar: two rows ─────────────────────────── */}
      <div className="mobile-top-bar sm:hidden fixed top-0 left-0 right-0 z-50 flex flex-col" style={{ background: 'rgba(8,8,8,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Row 1: logo + actions */}
        <div className="flex items-center justify-between h-12 px-4">
          <span className="font-display font-bold text-xl uppercase tracking-tight">
            <span style={{ color: 'var(--orange)' }}>RUN</span>
            <span className="text-white/50">DASH</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all disabled:opacity-50"
              style={{ color: syncMsg && !syncing ? 'var(--success)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : syncMsg ?? 'Sync'}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 flex items-center justify-center rounded-md transition-all"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* Row 2: nav tabs with underline indicator */}
        <div className="flex" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {navItems.map(({ href, label }) => {
            const active = path === href || (href !== '/' && path.startsWith(href)) || (href === '/groups' && path.startsWith('/group/'))
            const loading = pendingHref === href && isPending
            return (
              <Link
                key={href}
                href={href}
                prefetch={true}
                onClick={(e) => handleNavClick(e, href)}
                className="flex-1 flex items-center justify-center h-8 text-xs font-medium relative transition-colors duration-150"
                style={{
                  color: active || loading ? 'var(--orange)' : 'var(--text-muted)',
                  opacity: loading ? 0.75 : 1,
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                }}
              >
                {label}
                {(active || loading) && (
                  <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full" style={{ background: 'var(--orange)' }} />
                )}
              </Link>
            )
          })}
        </div>

        {isPending && (
          <div className="absolute bottom-0 left-0 h-[2px] animate-pulse" style={{ width: '40%', background: 'var(--orange)' }} />
        )}
      </div>

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
