import { type DistanceKey } from './types'
export const DISTANCE_KM: Record<DistanceKey, number> = { '5k': 5, '10k': 10, 'hm': 21.097, 'fm': 42.195 }
/**
 * Riegel formula with variable fatigue exponent.
 * Default exponents by distance gap:
 *   short→short: 1.06, short→HM: 1.07, short→FM: 1.08
 */
export function riegelProject(baseSecs: number, baseKm: number, targetKm: number, exponent?: number): number {
  const exp = exponent ?? (targetKm > 30 ? 1.08 : targetKm > 15 ? 1.07 : 1.06)
  return baseSecs * Math.pow(targetKm / baseKm, exp)
}
