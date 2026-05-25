import type { Metadata } from 'next'
import StandaloneDetector from '@/components/StandaloneDetector'
import { Archivo_Narrow, Archivo, JetBrains_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { UnitProvider } from '@/lib/unit-context'
import type { DistanceUnit } from '@/lib/utils'
import './globals.css'

// ── PULSE typography ─────────────────────────────────────────────────────
//   display: Archivo Narrow — UPPERCASE, tight letterspacing, 700
//   body:    Archivo (the wider sibling) — readable paragraph text
//   mono:    JetBrains Mono — tabular numerals for every data field
//
// All three variables are exposed to CSS as --font-display / --font-body /
// --font-mono so globals.css and Tailwind both pick them up.

const displayFont = Archivo_Narrow({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
})

const bodyFont = Archivo({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
})

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700'],
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export const metadata: Metadata = {
  title: 'RunDash',
  description: 'Personal running dashboard',
  icons: {
    icon: '/rundash-icon.png',
    apple: '/rundash-icon.png',
    shortcut: '/rundash-icon.png',
  },
  themeColor: '#0d0d0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body className="antialiased min-h-screen" style={{ fontFamily: 'var(--font-body)' }}>
        <script dangerouslySetInnerHTML={{__html: `(function(){try{if(navigator.standalone===true){document.documentElement.classList.add('standalone')}}catch(e){}})()`}} />
        <StandaloneDetector />
        <UnitProvider unit={unit}>
          {children}
        </UnitProvider>
      </body>
    </html>
  )
}
