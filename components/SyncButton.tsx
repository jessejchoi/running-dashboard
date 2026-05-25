'use client'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function SyncButton() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ newRuns: number; detailsSynced: number } | null>(null)

  async function handleSync() {
    setStatus('syncing')
    setResult(null)
    try {
      const res = await fetch('/api/sync-all', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setResult({ newRuns: data.newRuns ?? 0, detailsSynced: data.detailsSynced ?? 0 })
      setStatus('done')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center gap-3">
      {status === 'syncing' && (
        <p className="text-xs text-[#6b7280] animate-pulse">Syncing recent runs…</p>
      )}
      {status === 'done' && result && (
        <p className="text-xs text-[#b8d957]">
          ✓ {result.newRuns} new run{result.newRuns !== 1 ? 's' : ''}
          {result.detailsSynced > 0 ? `, ${result.detailsSynced} detailed` : ''}
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-[#e84d85]">Sync failed — try again</p>
      )}
      <button
        onClick={handleSync}
        disabled={status === 'syncing'}
        className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#1c1c1c] hover:bg-[#242424] border border-[#303037] text-white rounded-lg transition-all disabled:opacity-50"
      >
        <RefreshCw size={12} className={status === 'syncing' ? 'animate-spin' : ''} />
        {status === 'syncing' ? 'Syncing…' : 'Sync'}
      </button>
    </div>
  )
}
