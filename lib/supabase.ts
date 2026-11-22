import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Next.js 14 caches server-side fetch responses (reads AND writes) in its Data Cache
// unless told not to, and supabase-js sends plain fetches. In routes that don't opt
// out, such as the cron jobs, queries returned stale rows and writes never reached
// the database. Every database request skips that cache.
const options = {
  global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) },
}

// Client for browser use (limited permissions)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, options)

// Admin client for server-side use (API routes only — never import in components)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, options)
