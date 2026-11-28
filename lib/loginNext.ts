/** Cookie that carries a page to return to across the Strava login round trip. */
export const LOGIN_NEXT_COOKIE = 'login_next'

/** Only invite links may be returned to, so the redirect can't be pointed off-site. */
export function safeLoginNext(value: string | null | undefined): string | null {
  return value && /^\/join\/[A-Za-z0-9_-]+$/.test(value) ? value : null
}
