'use client'
import { useEffect } from 'react'

export default function StandaloneDetector() {
  useEffect(() => {
    const isStandalone = (window.navigator as any).standalone === true
    if (isStandalone) {
      document.documentElement.classList.add('standalone')
      // Directly patch every main element's padding — bypasses all CSS specificity
      document.querySelectorAll('main').forEach((el) => {
        (el as HTMLElement).style.paddingTop = '14px'
      })
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
