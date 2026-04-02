import 'server-only'
import type postgres from 'postgres'
import { getSqlClient } from './client'

// Schema definitions: table name → creation SQL
// Column validation: table name → required columns
const REQUIRED_TABLES: Record<string, { sql: string; columns: string[] }> = {
  users: {
    columns: [
      'id',
      'created_at',
      'updated_at',
      'discord_id',
      'discord_username',
      'discord_avatar',
      'display_name',
      'permissions',
      'is_active',
      'login_passkey_enabled',
      'login_discord_enabled',
      'login_magic_enabled',
      'login_qr_enabled',
      'welcome_wizard_completed_at',
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        discord_id TEXT UNIQUE,
        discord_username TEXT,
        discord_avatar TEXT,
        display_name TEXT,
        permissions TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT true,
        login_passkey_enabled BOOLEAN NOT NULL DEFAULT true,
        login_discord_enabled BOOLEAN NOT NULL DEFAULT true,
        login_magic_enabled BOOLEAN NOT NULL DEFAULT true,
        login_qr_enabled BOOLEAN NOT NULL DEFAULT true,
        welcome_wizard_completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS users_discord_id_idx ON users(discord_id);
    `,
  },
  invite_codes: {
    columns: [
      'id',
      'code',
      'created_by',
      'created_at',
      'expires_at',
      'used_at',
      'used_by',
      'is_used',
      'permissions',
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS invite_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ,
        used_at TIMESTAMPTZ,
        used_by UUID REFERENCES users(id) ON DELETE SET NULL,
        is_used BOOLEAN NOT NULL DEFAULT false,
        permissions TEXT NOT NULL DEFAULT ''
      );
    `,
  },
  passkey_credentials: {
    columns: ['id', 'user_id', 'credential_id', 'public_key', 'counter', 'device_type', 'backed_up', 'transports', 'created_at', 'last_used_at', 'name'],
    sql: `
      CREATE TABLE IF NOT EXISTS passkey_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        device_type TEXT NOT NULL,
        backed_up BOOLEAN NOT NULL DEFAULT false,
        transports TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ,
        name TEXT
      );
      CREATE INDEX IF NOT EXISTS passkey_credentials_user_id_idx ON passkey_credentials(user_id);
    `,
  },
  sessions: {
    columns: ['id', 'user_id', 'refresh_token_hash', 'is_pwa', 'expires_at', 'created_at', 'last_used_at', 'ip_address', 'user_agent'],
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash TEXT NOT NULL,
        is_pwa BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ip_address TEXT,
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_refresh_token_hash_idx ON sessions(refresh_token_hash);
    `,
  },
  magic_tokens: {
    columns: ['id', 'token_hash', 'discord_id', 'user_id', 'expires_at', 'used_at', 'is_used', 'created_at'],
    sql: `
      CREATE TABLE IF NOT EXISTS magic_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash TEXT UNIQUE NOT NULL,
        discord_id TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        is_used BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS magic_tokens_discord_id_idx ON magic_tokens(discord_id);
    `,
  },
  qr_login_sessions: {
    columns: ['id', 'totp_secret_encrypted', 'status', 'desktop_ip', 'desktop_user_agent', 'desktop_location', 'mobile_user_id', 'expires_at', 'created_at', 'scanned_at', 'resolved_at'],
    sql: `
      CREATE TABLE IF NOT EXISTS qr_login_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        totp_secret_encrypted TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        desktop_ip TEXT,
        desktop_user_agent TEXT,
        desktop_location TEXT,
        mobile_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        scanned_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS qr_login_sessions_status_idx ON qr_login_sessions(status);
    `,
  },
  pending_registrations: {
    columns: ['id', 'invite_code_id', 'registration_token', 'expires_at', 'created_at'],
    sql: `
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invite_code_id UUID NOT NULL REFERENCES invite_codes(id),
        registration_token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  webauthn_challenges: {
    columns: [
      'id',
      'challenge',
      'user_id',
      'pending_registration_id',
      'type',
      'expires_at',
      'created_at',
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge TEXT UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        pending_registration_id UUID REFERENCES pending_registrations(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
}

export async function validateAndMigrateSchema(): Promise<void> {
  const sql = getSqlClient()

  try {
    // Get all existing tables in the public schema
    const existingTables = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `
    const existingTableNames = new Set(existingTables.map((r) => r.table_name))

    // For each required table: create if missing, validate columns if exists
    for (const [tableName, { sql: createSql, columns }] of Object.entries(REQUIRED_TABLES)) {
      if (!existingTableNames.has(tableName)) {
        console.log(`[DB] Creating missing table: ${tableName}`)
        await sql.unsafe(createSql)
        console.log(`[DB] Created table: ${tableName}`)
      } else {
        // Table exists — validate required columns
        const existingColumns = await sql<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ${tableName}
        `
        const existingColumnNames = new Set(existingColumns.map((r) => r.column_name))
        const missingColumns = columns.filter((col) => !existingColumnNames.has(col))

        if (missingColumns.length > 0) {
          console.warn(
            `[DB] Table "${tableName}" is missing columns: ${missingColumns.join(', ')}. ` +
              `Please run the schema migration manually or drop and recreate the table.`
          )
          // We do NOT auto-add columns to existing tables (could corrupt data)
          // Log a clear warning but don't throw — app can still start
        }
      }
    }

    await ensureUserLoginMethodColumns(sql)
    await ensureDisplayNameColumn(sql)
    await ensureWelcomeWizardColumn(sql)
    await ensureWebAuthnPendingRegistrationColumn(sql)

    console.log('[DB] Schema validation complete')
  } finally {
    await sql.end()
  }
}

/** Adds per-user login method toggles to existing databases. */
async function ensureUserLoginMethodColumns(sql: postgres.Sql): Promise<void> {
  const alters = [
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS login_passkey_enabled BOOLEAN NOT NULL DEFAULT true',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS login_discord_enabled BOOLEAN NOT NULL DEFAULT true',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS login_magic_enabled BOOLEAN NOT NULL DEFAULT true',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS login_qr_enabled BOOLEAN NOT NULL DEFAULT true',
  ]
  for (const stmt of alters) {
    await sql.unsafe(stmt)
  }
}

async function ensureDisplayNameColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT')
}

async function ensureWelcomeWizardColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_wizard_completed_at TIMESTAMPTZ')
}

/** Links invite-registration WebAuthn challenges to pending_registrations (user_id is null for that path). */
async function ensureWebAuthnPendingRegistrationColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE webauthn_challenges
    ADD COLUMN IF NOT EXISTS pending_registration_id UUID REFERENCES pending_registrations(id) ON DELETE CASCADE
  `)
}
