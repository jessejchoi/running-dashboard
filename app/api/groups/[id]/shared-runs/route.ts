import { NextResponse } from 'next/server'

// Retired: prevent older clients from creating or changing coordinated events.
export function GET() {
  return NextResponse.json({ error: 'Shared-run coordination has been removed.' }, { status: 410 })
}
export const POST = GET
export const PATCH = GET
export const DELETE = GET
