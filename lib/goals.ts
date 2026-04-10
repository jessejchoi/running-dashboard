// Shared goal types and helpers used across components

export const DISTANCE_OPTIONS = [
  { key: '5k',  label: '5K',             km: 5,      defaultTarget: '22:30', placeholder: 'e.g. 22:30' },
  { key: '10k', label: '10K',            km: 10,     defaultTarget: '45:00', placeholder: 'e.g. 45:00' },
  { key: 'hm',  label: 'Half Marathon',  km: 21.097, defaultTarget: '1:45:00', placeholder: 'e.g. 1:45:00' },
  { key: 'fm',  label: 'Full Marathon',  km: 42.195, defaultTarget: '3:30:00', placeholder: 'e.g. 3:30:00' },
] as const

export type DistanceKey = '5k' | '10k' | 'hm' | 'fm'

export interface UserGoal {
  id: string
  athlete_id: number
  distance_key: DistanceKey
  label: string
  target_secs: number
  current_secs: number | null
  race_date: string   // ISO date string
}

export function distanceKm(key: DistanceKey): number {
  return DISTANCE_OPTIONS.find(d => d.key === key)!.km
}

export function distanceLabel(key: DistanceKey): string {
  return DISTANCE_OPTIONS.find(d => d.key === key)!.label
}

// Parse "mm:ss" or "h:mm:ss" → total seconds
export function parseTime(t: string): number {
  const parts = t.trim().split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

// Total seconds → "mm:ss" or "h:mm:ss"
export function formatGoalTime(secs: number): string {
  const total = Math.round(secs)
  if (total >= 3600) {
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// pace in sec/km from finish time + distance
export function paceSecs(totalSecs: number, key: DistanceKey): number {
  return totalSecs / distanceKm(key)
}
