import type { Metadata } from 'next'
import StandaloneDetector from '@/components/StandaloneDetector'
import { Syne, Space_Mono, DM_Sans } from 'next/font/google'
import { cookies } from 'next/headers'
import { UnitProvider } from '@/lib/unit-context'
import type { DistanceUnit } from '@/lib/utils'
import './globals.css'

const displayFont = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['700', '800'],
})

const bodyFont = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
})

const monoFont = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
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
