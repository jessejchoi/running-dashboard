'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add('standalone')
      const mains = document.querySelectorAll('main')
      mains.forEach((el) => {
        (el as HTMLElement).style.paddingTop = '14px'
        ;(el as HTMLElement).style.background = 'red' // DEBUG
      })
      // Debug banner
      const banner = document.createElement('div')
      banner.style.cssText = 'position:fixed;top:50px;left:0;right:0;z-index:9999;background:orange;color:black;font-size:11px;padding:4px;text-align:center;font-family:monospace'
      banner.textContent = `mains found: ${mains.length} | pt set to 14px`
      document.body.appendChild(banner)
    }
  }, [])
  return null
}
