'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add('standalone')
      const main = document.querySelector('main') as HTMLElement
      if (main) main.style.setProperty('padding-top', '56px', 'important')
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
