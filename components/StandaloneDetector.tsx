'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true

    if (isStandalone) {
      document.documentElement.classList.add('standalone')
      // Enable safe-area-inset env variables only in standalone
      const meta = document.createElement('meta')
      meta.name = 'viewport'
      meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
      document.head.appendChild(meta)
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
