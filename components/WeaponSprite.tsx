import { SPRITE_COLORS, SPRITE_SIZE, bossPixels, weaponPixels, type Pixel } from '@/lib/sprites'
import type { Tier } from '@/lib/rhythm'
import type { Boss } from '@/lib/raid'

export function PixelSprite({ pixels, label, size }: { pixels: Pixel[]; label: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {pixels.map(p => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={SPRITE_COLORS[p.color]} />
      ))}
    </svg>
  )
}

export function BossSprite({ boss, size = 96 }: { boss: Boss; size?: number }) {
  return <PixelSprite pixels={bossPixels(boss.key)} label={boss.name} size={size} />
}

export default function WeaponSprite({ tier, size = 48 }: { tier: Tier; size?: number }) {
  return <PixelSprite pixels={weaponPixels(tier.key)} label={tier.name} size={size} />
}
