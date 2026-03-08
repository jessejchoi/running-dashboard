'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    // navigator.standalone is the most reliable iOS signal
    // matchMedia is the standard but can be unreliable on iOS Safari
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches

    if (isStandalone) {
      document.documentElement.classList.add('standalone')
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
