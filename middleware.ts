import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    origin &&
    origin !== request.nextUrl.origin
  ) {
    return NextResponse.json(
      { error: 'Cross-origin writes are not allowed' },
      { status: 403 },
    )
  }
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export const config = { matcher: '/api/:path*' }
