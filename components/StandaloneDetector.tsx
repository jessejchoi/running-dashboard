'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add('standalone')

      // Top bar: add padding-top for status bar, increase height to match
      const topBar = document.querySelector('.mobile-top-bar') as HTMLElement
      if (topBar) {
        const insetTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0')
        topBar.style.setProperty('padding-top', 'env(safe-area-inset-top)', 'important')
        topBar.style.setProperty('height', 'auto', 'important')
      }

      // Main: pad by top bar natural height (48px) + status bar
      const main = document.querySelector('main') as HTMLElement
      if (main) {
        main.style.setProperty('padding-top', 'calc(48px + env(safe-area-inset-top))', 'important')
      }
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
