// Shared types and micro-components for Group page

export interface Goal {
  id: string
  athlete_id: number
  distance_key: string
  label: string
  target_secs: number
  current_secs: number | null
  race_date: string
}

export interface Member {
  athlete_id: number
  role: string
  joined_at: string
  name: string
  profile_pic: string | null
  gender: string | null
  goals: Goal[]
  is_me: boolean
  status_tag: string | null
}

export interface Run {
  id: number
  athlete_id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate: number | null
  run_type: string | null
}

export interface Group {
  id: string
  name: string
  invite_code: string
  created_by: number
  created_at: string
}

export interface LeaderboardRun {
  id: number
  athlete_id: number
  distance: number
  moving_time: number
  start_date: string
  suffer_score?: number | null
  average_speed?: number
  run_type?: string | null
  total_elevation_gain?: number
  laps?: Array<{
    average_speed?: number | null
    distance?: number | null
    moving_time?: number | null
    elapsed_time?: number | null
    [key: string]: unknown
  }> | null
  splits?: Array<{
    average_speed?: number | null
    distance?: number | null
    moving_time?: number | null
    elapsed_time?: number | null
    [key: string]: unknown
  }> | null
}

export interface Challenge {
  id: string
  group_id: string
  name: string
  description: string | null
  target_meters: number | null
  start_date: string
  end_date: string
  created_by: number
  created_at: string
  challenge_type: string
  config: Record<string, unknown>
  created_by_coach: boolean
}

export interface TrainingLoad {
  ctl: number
  atl: number
  tsb: number
}

export function formatTime(secs: number) {
  const total = Math.round(secs)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Avatar({ name, pic, size = 8 }: { name: string; pic: string | null; size?: number }) {
  const px = size * 4
  if (pic) {
    return <img src={pic} alt={name} style={{ width: px, height: px }} className="rounded-full object-cover shrink-0" />
  }
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ width: px, height: px }} className="rounded-full bg-[#ff1d6c]/20 flex items-center justify-center text-[#ff1d6c] font-bold text-xs shrink-0">
      {initials}
    </div>
  )
}

const STATUS_TAG_COLORS: Record<string, { bg: string; text: string }> = {
  'Injured':        { bg: '#7f1d1d', text: '#fca5a5' },
  'Taking it easy': { bg: '#1c1917', text: '#a8a29e' },
  'Milemaxxing':    { bg: '#14532d', text: '#86efac' },
  'Peak week':      { bg: '#7c2d12', text: '#ff7a9d' },
  'Tapering':       { bg: '#1e1b4b', text: '#a5b4fc' },
  'Base building':  { bg: '#164e63', text: '#67e8f9' },
}

export function StatusTag({ tag }: { tag: string }) {
  const colors = STATUS_TAG_COLORS[tag] ?? { bg: '#1c1c1c', text: '#9ca3af' }
  return (
    <span
      className="inline-block shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ background: colors.bg, color: colors.text }}
    >
      {tag}
    </span>
  )
}

export function RunTypeDot({ type }: { type: string | null }) {
  const colors: Record<string, string> = {
    intervals: 'bg-[#ff1d6c]',
    interval_5k: 'bg-[#ff1d6c]',
    tempo: 'bg-[#d9ff36]',
    threshold: 'bg-[#ff7a1c]',
    long_easy: 'bg-[#5ad7ff]',
    long_steady: 'bg-[#5ad7ff]',
    long_progressive: 'bg-[#5ad7ff]',
    easy: 'bg-[#d9ff36]',
    easy_strides: 'bg-[#d9ff36]',
    recovery: 'bg-green-400',
  }
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[type ?? ''] ?? 'bg-[#1a1a1a]'}`} />
  )
}
