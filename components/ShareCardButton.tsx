'use client'
import { useState } from 'react'
import { Download, Share2 } from 'lucide-react'

interface Props {
  /** The card PNG route. */
  url: string
  filename: string
  /** One line for the WhatsApp fallback. */
  text: string
}

async function fetchPng(url: string, filename: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Card failed: ${res.status}`)
  return new File([await res.blob()], filename, { type: 'image/png' })
}

function download(file: File) {
  const href = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = href
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

const BUTTON = 'flex-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-medium rounded-md transition-colors disabled:opacity-50'

/**
 * Share the card image straight into WhatsApp (or anywhere) via the share
 * sheet. Where files can't be shared, download it and open WhatsApp with a
 * one-line summary so the image can be attached by hand.
 */
export default function ShareCardButton({ url, filename, text }: Props) {
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)
  const [error, setError] = useState(false)

  async function run(action: 'share' | 'download') {
    setBusy(action)
    setError(false)
    try {
      const file = await fetchPng(url, filename)
      if (action === 'download') return download(file)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text }).catch(e => { if (e?.name !== 'AbortError') throw e })
        return
      }
      download(file)
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    } catch (e) {
      console.error('[raid] share failed', e)
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run('share')}
          disabled={busy != null}
          className={`${BUTTON} bg-[#f97316] hover:bg-[#ea580c] text-black`}
          style={{ minHeight: 44 }}
        >
          <Share2 size={14} /> {busy === 'share' ? 'Preparing…' : 'Share'}
        </button>
        <button
          type="button"
          onClick={() => run('download')}
          disabled={busy != null}
          className={`${BUTTON} border border-[#2a2a2a] hover:border-[#383838] text-white`}
          style={{ minHeight: 44 }}
        >
          <Download size={14} /> {busy === 'download' ? 'Preparing…' : 'Download'}
        </button>
      </div>
      {error && <p role="status" className="text-[12px] mt-1.5" style={{ color: 'var(--error)' }}>Couldn&apos;t make the card. Try again.</p>}
    </div>
  )
}
