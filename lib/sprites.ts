import type { TierKey } from '@/lib/rhythm'

/*
 * 16×16 pixel weapons, drawn upright with the grip at the bottom. Each grid row
 * is one line of pixels: '.' empty, 'o' orange accent, 's' steel, 'd' steel shadow.
 */
export const SPRITE_SIZE = 16
export const SPRITE_COLORS = { o: '#f97316', s: '#a1a1aa', d: '#52525b' } as const
type Color = keyof typeof SPRITE_COLORS

export interface Pixel {
  x: number
  y: number
  color: Color
}

const GRIDS: Record<TierKey, string[]> = {
  unarmed: [
    '................',
    '................',
    '......d..d......',
    '...d........d...',
    '................',
    '..d..........d..',
    '................',
    '................',
    '................',
    '................',
    '..d..........d..',
    '................',
    '...d........d...',
    '......d..d......',
    '................',
    '................',
  ],
  stick: [
    '................',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '......ooo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......ooo......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '................',
  ],
  dagger: [
    '................',
    '................',
    '................',
    '................',
    '.......ss.......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '....oooooooo....',
    '.......oo.......',
    '.......oo.......',
    '......oooo......',
    '................',
    '................',
  ],
  sword: [
    '.......ss.......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '......sdss......',
    '..oooooooooooo..',
    '..o....oo....o..',
    '.......oo.......',
    '.......oo.......',
    '......oooo......',
    '................',
  ],
  axe: [
    '.......oo.......',
    '..ssssdoo.......',
    '.sssssdoo.......',
    'sssssssoo.......',
    'sssssssoo.......',
    '.sssssdoo.......',
    '..ssssdoo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '.......oo.......',
    '......oooo......',
    '................',
  ],
  legendary: [
    '.s.....oo.......',
    'sss...osoo......',
    '.s....osoo......',
    '......osoo......',
    '......osoo....s.',
    '......osoo...sss',
    '......osoo....s.',
    '......osoo......',
    '......osoo......',
    '......osoo......',
    '..ssssssosssss..',
    '..s....ss....s..',
    '.......ss.......',
    '.......ss.......',
    '......ssss......',
    '................',
  ],
}

export function weaponPixels(tier: TierKey): Pixel[] {
  const pixels: Pixel[] = []
  GRIDS[tier].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c !== '.') pixels.push({ x, y, color: c as Color })
    }
  })
  return pixels
}

/** Every grid must be exactly 16×16 using the known colors (checked in tests). */
export function spriteGrids() {
  return GRIDS
}
