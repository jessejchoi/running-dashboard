import { getAthleteId } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { projectAthleteRaceTimes } from '@/lib/analysis/projector-service'
import { getAthleteAnalysis, currentEstimatesFromResult } from '@/lib/analysis/service'
import { formatTime } from '@/lib/analysis'

/**
 * Side-by-side dump of the new (CP) and legacy (combine.ts) engines for the
 * logged-in athlete. Pure diagnostic — no writes, no flag required.
 *
 * Returns enough info to eyeball-validate the new engine before flipping
 * USE_CP_ENGINE=true in production.
 */
export async function GET() {
  const cookieStore = cookies()
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const id = Number(athleteId)

  // Force the legacy path so the comparison isn't a tautology when the flag is on.
  const legacy = await getAthleteAnalysis(id, {
    easyLookbackMonths: 3,
    longLimit: 15,
    raceLimit: 10,
    allActivitiesLimit: 200,
  })
  const legacyEstimates = currentEstimatesFromResult(legacy.result)

  const newEngine = await projectAthleteRaceTimes(id)
  if (!newEngine) {
    return NextResponse.json({
      legacy: {
        '5k':  legacyEstimates['5k']  != null ? formatTime(legacyEstimates['5k']!)  : null,
        '10k': legacyEstimates['10k'] != null ? formatTime(legacyEstimates['10k']!) : null,
        'hm':  legacyEstimates['hm']  != null ? formatTime(legacyEstimates['hm']!)  : null,
        'fm':  legacyEstimates['fm']  != null ? formatTime(legacyEstimates['fm']!)  : null,
      },
      new: null,
      reason: 'CP fit returned null — likely no best-efforts data yet. Have you run /api/admin/backfill-features?',
    })
  }

  const projections = Object.fromEntries(newEngine.projections.map(p => [p.distanceKey, {
    today:    formatTime(p.todaySecs),
    ideal:    formatTime(p.idealSecs),
    p80Low:   formatTime(p.p80SecsLow),
    p80High:  formatTime(p.p80SecsHigh),
    base:     formatTime(p.baseSecs),
    raceDay:  p.raceDaySecs != null ? formatTime(p.raceDaySecs) : null,
    confidence: p.confidence,
    modifiers: {
      endurance: +p.modifiers.enduranceMultiplier.toFixed(4),
      drift:     +p.modifiers.driftMultiplier.toFixed(4),
      heat:      +p.modifiers.heatMultiplier.toFixed(4),
      form:      +p.modifiers.formMultiplier.toFixed(4),
      bandPct:   +p.modifiers.bandPct.toFixed(4),
    },
  }]))

  return NextResponse.json({
    fit: {
      cv: +newEngine.fit.cv.toFixed(3),
      dPrime: +newEngine.fit.dPrime.toFixed(1),
      vmax: +newEngine.fit.vmax.toFixed(3),
      rmse: +newEngine.fit.rmse.toFixed(4),
      nPoints: newEngine.fit.nPoints,
      durationRangeSecs: newEngine.fit.durationRangeSecs,
      fitQuality: newEngine.fit.fitQuality,
    },
    features: {
      aerobic: {
        nPoints: newEngine.features.aerobic.points.length,
        currentPaceSecPerKm: newEngine.features.aerobic.currentPaceSecPerKm != null
          ? +newEngine.features.aerobic.currentPaceSecPerKm.toFixed(1) : null,
        trendSecPerKmPerWeek: newEngine.features.aerobic.trendSecPerKmPerWeek != null
          ? +newEngine.features.aerobic.trendSecPerKmPerWeek.toFixed(2) : null,
      },
      endurance: newEngine.features.endurance,
      form: newEngine.features.form,
      drift: newEngine.features.drift,
      windowDays: newEngine.features.windowDays,
    },
    currentConditions: newEngine.currentConditions,
    new: projections,
    legacy: {
      '5k':  legacyEstimates['5k']  != null ? formatTime(legacyEstimates['5k']!)  : null,
      '10k': legacyEstimates['10k'] != null ? formatTime(legacyEstimates['10k']!) : null,
      'hm':  legacyEstimates['hm']  != null ? formatTime(legacyEstimates['hm']!)  : null,
      'fm':  legacyEstimates['fm']  != null ? formatTime(legacyEstimates['fm']!)  : null,
    },
  })
}
