import { describe, it, expect } from 'vitest'
import { AWARD_CATEGORIES, isValidAwardKey } from '@/lib/awards'

describe('AWARD_CATEGORIES', () => {
  it('has exactly 10 categories', () => {
    expect(Object.keys(AWARD_CATEGORIES)).toHaveLength(10)
  })

  it('every category has a label and emoji', () => {
    for (const [key, val] of Object.entries(AWARD_CATEGORIES)) {
      expect(val.label, `${key} missing label`).toBeTruthy()
      expect(val.emoji, `${key} missing emoji`).toBeTruthy()
    }
  })

  it('includes all expected keys', () => {
    const expected = [
      'mileage_monster', 'speed_demon', 'comeback_kid', 'dark_horse',
      'consistency_crown', 'iron_legs', 'rest_day_rebel', 'pace_wizard',
      'race_fuel', 'precision_pacer',
    ]
    for (const key of expected) {
      expect(AWARD_CATEGORIES).toHaveProperty(key)
    }
  })
})

describe('isValidAwardKey', () => {
  it('returns true for a valid key', () => {
    expect(isValidAwardKey('mileage_monster')).toBe(true)
    expect(isValidAwardKey('precision_pacer')).toBe(true)
  })

  it('returns false for an invalid key', () => {
    expect(isValidAwardKey('invalid_key')).toBe(false)
    expect(isValidAwardKey('')).toBe(false)
    expect(isValidAwardKey('🏆')).toBe(false)
  })

  it('returns false for keys with wrong casing', () => {
    expect(isValidAwardKey('Mileage_Monster')).toBe(false)
    expect(isValidAwardKey('SPEED_DEMON')).toBe(false)
  })
})
