import type { Metadata } from 'next'
import StandaloneDetector from '@/components/StandaloneDetector'
import { Syne, Space_Mono, DM_Sans } from 'next/font/google'
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
  viewportFit: 'cover',  // enables safe-area-inset-* CSS env variables
}

export const metadata: Metadata = {
  title: 'RunDash',
  description: 'Personal running dashboard',
  icons: {
    icon: '/icon.svg',
  },
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body className="bg-[#0a0a0a] text-white font-sans antialiased min-h-screen">
        <StandaloneDetector />
        {children}
      </body>
    </html>
  )
}
