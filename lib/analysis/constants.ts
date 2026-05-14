export const DISTANCE_KEYS = ['5k', '10k', 'hm', 'fm'] as const

export const ANALYSIS_RUN_TYPES = {
  intervals: ['intervals', 'interval_5k', 'interval_10k'],
  threshold: ['threshold', 'tempo'],
  long: ['long', 'long_easy', 'long_progressive', 'long_steady'],
  easy: ['easy', 'easy_strides', 'long_easy', 'recovery'],
} as const

// Exclude streams (GPS point arrays, often thousands of points) but keep laps
// and splits, which the analysis engine uses for drift and steady windows.
export const ANALYSIS_ACTIVITY_COLUMNS = [
  'id',
  'athlete_id',
  'name',
  'type',
  'start_date',
  'distance',
  'moving_time',
  'elapsed_time',
  'total_elevation_gain',
  'average_speed',
  'max_speed',
  'average_heartrate',
  'max_heartrate',
  'average_cadence',
  'suffer_score',
  'raw',
  'laps',
  'splits',
  'run_type',
  'run_type_manual',
  'is_race',
  'excluded_from_analysis',
].join(', ')
