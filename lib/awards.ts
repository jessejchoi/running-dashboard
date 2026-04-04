export const AWARD_CATEGORIES: Record<string, { label: string; emoji: string }> = {
  mileage_monster:   { label: 'Mileage Monster',   emoji: '🦣' },
  speed_demon:       { label: 'Speed Demon',        emoji: '⚡' },
  comeback_kid:      { label: 'Comeback Kid',       emoji: '🔥' },
  dark_horse:        { label: 'Dark Horse',         emoji: '🐴' },
  consistency_crown: { label: 'Consistency Crown',  emoji: '👑' },
  iron_legs:         { label: 'Iron Legs',          emoji: '🦵' },
  rest_day_rebel:    { label: 'Rest Day Rebel',     emoji: '😴' },
  pace_wizard:       { label: 'Pace Wizard',        emoji: '🧙' },
  race_fuel:         { label: 'Race Fuel',          emoji: '⛽' },
  precision_pacer:   { label: 'Precision Pacer',    emoji: '🎯' },
}

export function isValidAwardKey(key: string): key is keyof typeof AWARD_CATEGORIES {
  return key in AWARD_CATEGORIES
}
