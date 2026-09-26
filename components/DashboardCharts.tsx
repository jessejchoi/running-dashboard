'use client'
import dynamic from 'next/dynamic'

// Recharts is the heaviest client dependency on the dashboard. Loading the
// charts after first paint keeps the stats and cards interactive sooner; the
// placeholder fills the parent's fixed height so nothing shifts.
function ChartPlaceholder() {
  return <div className="h-full w-full rounded-lg bg-[#1c1c1c] animate-pulse" />
}

export const WeeklyMileageChart = dynamic(
  () => import('@/components/WeeklyMileageChart'),
  { ssr: false, loading: ChartPlaceholder },
)

export const TrainingLoadChart = dynamic(
  () => import('@/components/TrainingLoadChart'),
  { ssr: false, loading: ChartPlaceholder },
)
