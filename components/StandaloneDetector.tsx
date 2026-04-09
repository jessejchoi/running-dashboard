'use client'
import { useEffect } from 'react'

// Ensures html.standalone class is present after hydration.
// The blocking script in layout.tsx sets it before first paint;
// this useEffect is a safety net in case that script is deferred.
export default function StandaloneDetector() {
  useEffect(() => {
    if ((window.navigator as any).standalone === true) {
      document.documentElement.classList.add('standalone')
    } else {
      document.documentElement.classList.remove('standalone')
    }
  }, [])
  return null
}
