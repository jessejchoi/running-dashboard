'use client'
import { useEffect } from 'react'
export default function BackgroundWork() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastRun = 0
    function schedule(ms: number) {
      clearTimeout(timer)
      timer = setTimeout(tick, ms)
    }
    async function tick() {
      // Hidden tabs (backgrounded PWA, other browser tab) don't poll; the
      // visibilitychange handler resumes as soon as the page is shown again.
      if (document.hidden) return
      lastRun = Date.now()
      try {
        const response = await fetch('/api/work', { method: 'POST' })
        const body = response.ok ? await response.json() : null
        // Only ask views to refetch when a job actually changed something.
        if (!cancelled && body?.ran > 0)
          window.dispatchEvent(new Event('rundash:refresh'))
      } catch {}
      if (!cancelled) schedule(60000)
    }
    function onVisibility() {
      if (document.hidden || cancelled) return
      schedule(Math.max(0, 60000 - (Date.now() - lastRun)))
    }
    schedule(3000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return null
}
