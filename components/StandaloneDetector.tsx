'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add('standalone')
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
