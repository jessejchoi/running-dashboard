export function calcVdot(secs: number): number { const tMin = secs / 60; const speed = 5000 / tMin; const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin); const vo2 = -4.6 + 0.182258 * speed + 0.000104 * speed * speed; return Math.round(vo2 / pct * 10) / 10 }
export function formatTime(secs: number): string {
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    let s = Math.round(secs % 60)
    if (s === 60) { return `${h}:${(m + 1).toString().padStart(2, '0')}:00` }
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  let m = Math.floor(secs / 60)
  let s = Math.round(secs % 60)
  if (s === 60) { m += 1; s = 0 }
  return `${m}:${s.toString().padStart(2, '0')}`
}
export function formatPace(secsPerKm: number): string {
  let m = Math.floor(secsPerKm / 60)
  let s = Math.round(secsPerKm % 60)
  if (s === 60) { m += 1; s = 0 }
  return `${m}:${s.toString().padStart(2, '0')}`
}
