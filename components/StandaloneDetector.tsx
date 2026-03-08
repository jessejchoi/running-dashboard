'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true

    if (isStandalone) {
      document.documentElement.classList.add('standalone')
      // Override padding directly on the element via CSS variable
      document.documentElement.style.setProperty('--main-pt', '56px')
    } else {
      document.documentElement.classList.remove('standalone')
      document.documentElement.style.removeProperty('--main-pt')
    }
  }, [])
  return null
}
