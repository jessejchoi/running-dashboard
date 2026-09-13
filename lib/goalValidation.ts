import { validDate, validTimezone } from '@/lib/calendar'
export function validateRace(body: any) {
  if (!body || typeof body !== 'object') throw new Error('Invalid goal')
  const { distance_key, label, target_secs, race_date } = body
  if (
    !['5k', '10k', 'hm', 'fm'].includes(distance_key) ||
    typeof label !== 'string' ||
    !label.trim() ||
    label.length > 120 ||
    !Number.isInteger(target_secs) ||
    target_secs <= 0 ||
    target_secs > 86400 ||
    !validDate(race_date)
  )
    throw new Error('Enter a race name, valid distance, target time and date')
  const status = body.status ?? 'active'
  if (!['active', 'completed', 'archived'].includes(status))
    throw new Error('Invalid status')
  const result = body.result_secs ?? null
  if (
    result !== null &&
    (!Number.isInteger(result) || result <= 0 || result > 86400)
  )
    throw new Error('Invalid race result')
  if (status === 'completed' && !result)
    throw new Error('Record an actual result to complete a race goal')
  const timezone = body.timezone ?? 'Asia/Jakarta'
  if (!validTimezone(timezone)) throw new Error('Invalid timezone')
  const baseline = body.current_secs ?? null
  if (
    baseline !== null &&
    (!Number.isInteger(baseline) || baseline <= 0 || baseline > 86400)
  )
    throw new Error('Invalid baseline')
  const resultActivity = body.result_activity_id ?? null
  if (
    resultActivity !== null &&
    (!Number.isSafeInteger(resultActivity) || resultActivity <= 0 || !result)
  )
    throw new Error('A linked run requires an actual race result')
  return {
    distance_key,
    label: label.trim(),
    target_secs,
    race_date,
    current_secs: baseline,
    status,
    result_secs: result,
    result_activity_id: resultActivity,
    timezone,
  }
}
