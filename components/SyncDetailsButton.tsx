'use client'
import { useState } from 'react'
import { Download } from 'lucide-react'

export default function SyncDetailsButton({ unsynced }: { unsynced: number }) {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done'>('idle')
  const [synced, setSynced] = useState(0)

  async function handleSync() {
    setStatus('syncing')
    // Sync in batches of 50 (rate limited to ~1/sec each, so 50 takes ~55s)
    const res = await fetch('/api/sync-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 }),
    })
    const data = await res.json()
    setSynced(data.synced ?? 0)
    setStatus('done')
    setTimeout(() => window.location.reload(), 1500)
  }

  return (
    <div className="flex items-center gap-3">
      {status === 'syncing' && (
        <p className="text-xs text-[#6b7280] animate-pulse">
          Fetching lap data… (~1 min for 50 runs)
        </p>
      )}
      {status === 'done' && (
        <p className="text-xs text-emerald-400">✓ Synced {synced} runs</p>
      )}
      <button
        onClick={handleSync}
        disabled={status === 'syncing'}
        className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#1c1c1c] hover:bg-[#242424] border border-[#2a2a2a] text-white rounded-lg transition-all disabled:opacity-50"
      >
        <Download size={12} className={status === 'syncing' ? 'animate-bounce' : ''} />
        {status === 'syncing' ? 'Syncing…' : `Sync lap data (${unsynced} runs)`}
      </button>
    </div>
  )
}
