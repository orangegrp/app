import 'server-only'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const databaseUrl = process.env.DATABASE_URL

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
}

// Supabase JS client (service role — bypasses RLS, server-only)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Direct PostgreSQL connection for schema management (DDL)
// Only instantiated when DATABASE_URL is available
export function getSqlClient(): ReturnType<typeof postgres> {
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL environment variable (required for schema management)')
  }
  return postgres(databaseUrl, { max: 1, idle_timeout: 20, connect_timeout: 10 })
}
