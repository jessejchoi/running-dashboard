import type { Metadata } from 'next'
import StandaloneDetector from '@/components/StandaloneDetector'
import localFont from 'next/font/local'
import { cookies } from 'next/headers'
import { UnitProvider } from '@/lib/unit-context'
import type { DistanceUnit } from '@/lib/utils'
import './globals.css'

// Self-hosted Google Fonts (latin subset), so builds never fetch from Google:
// a changed Google response once left the page and its CSS with mismatched font
// class names after a partly cached Vercel build. Syne and DM Sans are variable.
const displayFont = localFont({
  src: './fonts/Syne-latin.woff2',
  variable: '--font-display',
  weight: '700 800',
  display: 'swap',
})

const bodyFont = localFont({
  src: './fonts/DMSans-latin.woff2',
  variable: '--font-body',
  weight: '400 600',
  display: 'swap',
})

const monoFont = localFont({
  src: [
    { path: './fonts/SpaceMono-Regular-latin.woff2', weight: '400' },
    { path: './fonts/SpaceMono-Bold-latin.woff2', weight: '700' },
  ],
  variable: '--font-mono',
  display: 'swap',
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#0a0a0a',
}

export const metadata: Metadata = {
  title: 'RunDash',
  description: 'Personal running dashboard',
  icons: {
    icon: '/rundash-icon.png',
    apple: '/rundash-icon.png',
    shortcut: '/rundash-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const unit = (cookieStore.get('unit_pref')?.value ?? 'km') as DistanceUnit

  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body className="bg-[#0a0a0a] text-white font-sans antialiased min-h-screen">
        {/* Blocking script: sets html.standalone before first paint so CSS
            env(safe-area-inset-*) rules apply from the initial render,
            preventing the pill position jump on first webapp load. */}
        <script dangerouslySetInnerHTML={{__html: `(function(){try{if(navigator.standalone===true){document.documentElement.classList.add('standalone')}}catch(e){}})()`}} />
        <StandaloneDetector />
        <UnitProvider unit={unit}>
          {children}
        </UnitProvider>
      </body>
    </html>
  )
}
