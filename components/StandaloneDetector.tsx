'use client'
import { useEffect, useState } from 'react'

export default function StandaloneDetector() {
  const [debug, setDebug] = useState<string | null>(null)

  useEffect(() => {
    const navStandalone = (window.navigator as any).standalone
    const mmStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isStandalone = navStandalone === true || mmStandalone

    if (isStandalone) {
      document.documentElement.classList.add('standalone')
    } else {
      document.documentElement.classList.remove('standalone')
    }

    setDebug(`nav.standalone=${String(navStandalone)} | mm=${String(mmStandalone)} | class=${isStandalone ? 'SET' : 'NOT SET'}`)
  }, [])

  if (!debug) return null

  return (
    <div style={{
      position: 'fixed', top: 60, left: 0, right: 0, zIndex: 9999,
      background: 'rgba(249,115,22,0.95)', color: '#000',
      fontSize: 11, padding: '4px 8px', textAlign: 'center',
      fontFamily: 'monospace'
    }}>
      {debug}
    </div>
  )
}
