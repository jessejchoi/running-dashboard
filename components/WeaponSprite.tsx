import { SPRITE_COLORS, SPRITE_SIZE, weaponPixels } from '@/lib/sprites'
import type { Tier } from '@/lib/rhythm'

export default function WeaponSprite({ tier, size = 48 }: { tier: Tier; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={tier.name}
    >
      {weaponPixels(tier.key).map(p => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1} height={1} fill={SPRITE_COLORS[p.color]} />
      ))}
    </svg>
  )
}
