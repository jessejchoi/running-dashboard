'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add('standalone')

      // Try every possible way to reduce top spacing
      const main = document.querySelector('main') as HTMLElement
      if (main) {
        main.setAttribute('style', 'padding-top: 52px !important; margin-top: 0px !important;')
        // Also check first child
        const firstChild = main.firstElementChild as HTMLElement
        if (firstChild) {
          firstChild.setAttribute('style', firstChild.getAttribute('style') || '' + '; margin-top: 0px !important;')
        }
      }

      // Debug: show computed padding
      setTimeout(() => {
        const m = document.querySelector('main') as HTMLElement
        if (m) {
          const computed = window.getComputedStyle(m).paddingTop
          const banner = document.createElement('div')
          banner.style.cssText = 'position:fixed;top:55px;left:0;right:0;z-index:9999;background:orange;color:black;font-size:11px;padding:3px;text-align:center;font-family:monospace'
          banner.textContent = `computed pt: ${computed} | inline: ${m.style.paddingTop}`
          document.body.appendChild(banner)
        }
      }, 500)
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
