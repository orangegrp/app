'use client'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // During SSR/build, env vars might not be available — don't throw
  if (typeof window !== 'undefined') {
    console.warn('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
}

// Lazy singleton — only create when env vars are available
let _client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!_client) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase client not configured — missing NEXT_PUBLIC_SUPABASE_* env vars')
    }
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  return _client
}
