import type { TierKey } from '@/lib/rhythm'
import type { BossKey } from '@/lib/raid'

/*
 * 16×16 pixel weapons (drawn upright with the grip at the bottom) and raid
 * bosses. Each grid row is one line of pixels: '.' empty, 'o' orange accent,
 * 's' steel, 'd' steel shadow.
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

const BOSS_GRIDS: Record<BossKey, string[]> = {
  // Humidity Golem: a stone brute steaming in the heat
  golem: [
    '...o......o.....',
    '....o......o....',
    '...o..dddddd....',
    '.....dssssssd...',
    '....dsoossoosd..',
    '....dssssssssd..',
    '....dssddddssd..',
    '..dddssssssssddd',
    '.dsssddssssddsss',
    '.dssd.dssssd.dss',
    '.dsd..dssssd..ds',
    '..o...dssssd...o',
    '......dsddsd....',
    '.....dssd.dssd..',
    '.....dssd.dssd..',
    '....ddddd.ddddd.',
  ],
  // Traffic Kraken: tentacles tipped with brake lights
  kraken: [
    '......dddd......',
    '....ddssssdd....',
    '...dssssssssd...',
    '..dssssssssssd..',
    '..dsoossssoosd..',
    '..dsoossssoosd..',
    '..dssssssssssd..',
    '...dssddddssd...',
    '...dssssssssd...',
    '..dsd.dssd.dsd..',
    '.dsd..dssd..dsd.',
    '.dsd.dsd.dsd.dsd',
    'dsd..dsd..dsd.ds',
    'od...do....od..o',
    '.....o......o...',
    '................',
  ],
  // Couch Lich: a crowned skull sunk into an orange couch
  lich: [
    '..o..o....o..o..',
    '..oooooooooooo..',
    '...ssssssssss...',
    '..ssssssssssss..',
    '..sddsssssddss..',
    '..sdodssssdods..',
    '..ssssssddssss..',
    '...ssssssssss...',
    '....sdsdsdsds...',
    '.....ssssss.....',
    'dddd.dsssd..dddd',
    'dood.dsssd..dood',
    'dooooooooooooood',
    'dooooooooooooood',
    'dddddddddddddddd',
    '.d............d.',
  ],
  // Snooze Hydra: three heads, all hitting snooze
  hydra: [
    '.dsd........dsd.',
    'dsosd......dsosd',
    'dssss.dsd.sssssd',
    '.dds.dsosd.sdd..',
    '..ds.dssss.sd...',
    '..ds..dds..sd...',
    '..dss..ds.ssd...',
    '...dss.ds.sd....',
    '....dssssssd....',
    '...dssssssssd...',
    '..dssssssssssd..',
    '..dssddddddssd..',
    '..dssssssssssd..',
    '...dssd..dssd...',
    '...ddd....ddd...',
    '................',
  ],
  // Monsoon Wyrm: a serpent coiled in the rain
  wyrm: [
    '.o....o.....o...',
    '...o.....o....o.',
    '..........dsssd.',
    '.o.......dssoosd',
    '........dssssssd',
    '..o.....dsddddd.',
    '.......dssd..o..',
    '..dddddssd......',
    '.dssssssd....o..',
    'dssd........o...',
    'dssd..ddddd.....',
    '.dsssssssssd....',
    '..ddddddddssd...',
    '..o.......dssd..',
    '....dssssssssd..',
    '.....ddddddddo..',
  ],
  // Excuse Goblin King: big ears, bigger crown
  goblin: [
    '...o..o..o..o...',
    '...oooooooooo...',
    '....dssssssd....',
    'd..dssssssssd..d',
    'sd.dssssssssd.ds',
    '.sdsoodsdoodssd.',
    '..dssssssssssd..',
    '...dssddddssd...',
    '...dsosssosd....',
    '....dssssssd....',
    '.....dddddd.....',
    '....oooooooo....',
    '...oooooooooo...',
    '..dooooooooood..',
    '..do.oooooo.od..',
    '....dd....dd....',
  ],
}

function pixels(grid: string[]): Pixel[] {
  const result: Pixel[] = []
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c !== '.') result.push({ x, y, color: c as Color })
    }
  })
  return result
}

export function weaponPixels(tier: TierKey): Pixel[] {
  return pixels(GRIDS[tier])
}

export function bossPixels(boss: BossKey): Pixel[] {
  return pixels(BOSS_GRIDS[boss])
}

/** Every grid must be exactly 16×16 using the known colors (checked in tests). */
export function spriteGrids() {
  return { ...GRIDS, ...BOSS_GRIDS }
}
