import { describe, expect, it } from 'vitest'
import { safeLoginNext } from '@/lib/loginNext'

describe('safeLoginNext', () => {
  it('keeps invite links', () => {
    expect(safeLoginNext('/join/abc123')).toBe('/join/abc123')
    expect(safeLoginNext('/join/a_b-C')).toBe('/join/a_b-C')
  })

  it('drops anything that could leave the site or go elsewhere', () => {
    for (const bad of [null, undefined, '', '/', '//evil.com', 'https://evil.com/join/x', '/join/', '/join/x/../../admin', '/join/x?y=1', '/settings']) {
      expect(safeLoginNext(bad)).toBeNull()
    }
  })
})
