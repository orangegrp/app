/**
 * One-off: run validateAndMigrateSchema (DDL + ensure* columns).
 * Usage: node --env-file=.env.local ./scripts/run-db-migration.mts
 */
import { validateAndMigrateSchema } from '../server/db/supabase/schema'

await validateAndMigrateSchema()
console.log('[run-db-migration] OK')
