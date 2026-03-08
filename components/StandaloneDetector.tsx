'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true

    if (isStandalone) {
      document.documentElement.classList.add('standalone')
      // Add viewport-fit=cover only in standalone so env(safe-area-inset-*)
      // works for the home indicator — without this it's always 0 in standalone too
      const existing = document.querySelector('meta[name="viewport"]')
      if (existing) {
        existing.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
      } else {
        const meta = document.createElement('meta')
        meta.name = 'viewport'
        meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
        document.head.appendChild(meta)
      }
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
