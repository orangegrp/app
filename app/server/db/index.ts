import 'server-only'
import { SupabaseAdapter } from './supabase/adapter'

// To swap backends: import a different adapter and instantiate it here.
// The adapter must implement the DBAdapter interface from ./interface.ts
export const db = new SupabaseAdapter()
