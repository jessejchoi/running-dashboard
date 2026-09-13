'use client'
import { useEffect } from 'react'
export default function BackgroundWork() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function tick() {
      try {
        const response = await fetch('/api/work', { method: 'POST' })
        if (response.ok && !cancelled)
          window.dispatchEvent(new Event('rundash:refresh'))
      } catch {}
      if (!cancelled) timer = setTimeout(tick, 60000)
    }
    timer = setTimeout(tick, 3000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])
  return null
}
