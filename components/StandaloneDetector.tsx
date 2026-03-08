'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add('standalone')

      // Get the actual status bar height
      const safeTop = parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue('env(safe-area-inset-top)') || '0'
      ) || 50 // fallback 50px for iPhone with notch/dynamic island

      const topBar = document.querySelector('.mobile-top-bar') as HTMLElement
      if (topBar) {
        topBar.setAttribute('style', `padding-top: env(safe-area-inset-top); height: auto; min-height: 48px;`)
      }

      // Main padding = top bar content height (48px) + status bar
      const main = document.querySelector('main') as HTMLElement
      if (main) {
        main.setAttribute('style', 'padding-top: calc(48px + env(safe-area-inset-top)) !important;')
      }
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
