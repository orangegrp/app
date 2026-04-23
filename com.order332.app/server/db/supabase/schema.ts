import "server-only"
import type postgres from "postgres"
import { getSqlClient } from "./client"

// Schema definitions: table name → creation SQL
// Column validation: table name → required columns
const REQUIRED_TABLES: Record<string, { sql: string; columns: string[] }> = {
  users: {
    columns: [
      "id",
      "created_at",
      "updated_at",
      "discord_id",
      "discord_username",
      "discord_avatar",
      "display_name",
      "permissions",
      "is_active",
      "login_passkey_enabled",
      "login_discord_enabled",
      "login_magic_enabled",
      "login_qr_enabled",
      "welcome_wizard_completed_at",
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
      "id",
      "code",
      "created_by",
      "created_at",
      "expires_at",
      "used_at",
      "used_by",
      "is_used",
      "permissions",
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
    columns: [
      "id",
      "user_id",
      "credential_id",
      "public_key",
      "counter",
      "device_type",
      "backed_up",
      "transports",
      "created_at",
      "last_used_at",
      "name",
    ],
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
    columns: [
      "id",
      "user_id",
      "refresh_token_hash",
      "is_pwa",
      "expires_at",
      "created_at",
      "last_used_at",
      "ip_address",
      "user_agent",
    ],
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
    columns: [
      "id",
      "token_hash",
      "discord_id",
      "user_id",
      "expires_at",
      "used_at",
      "is_used",
      "created_at",
    ],
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
    columns: [
      "id",
      "totp_secret_encrypted",
      "status",
      "desktop_ip",
      "desktop_user_agent",
      "desktop_location",
      "mobile_user_id",
      "expires_at",
      "created_at",
      "scanned_at",
      "resolved_at",
    ],
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
    columns: [
      "id",
      "invite_code_id",
      "registration_token",
      "expires_at",
      "created_at",
    ],
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
      "id",
      "challenge",
      "user_id",
      "pending_registration_id",
      "type",
      "expires_at",
      "created_at",
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
  blog_ai_usage: {
    columns: ["id", "created_at", "user_id", "action", "input_chars"],
    sql: `
      CREATE TABLE IF NOT EXISTS blog_ai_usage (
        id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
        created_at  TIMESTAMPTZ DEFAULT now()             NOT NULL,
        user_id     TEXT                                  NOT NULL,
        action      TEXT                                  NOT NULL,
        input_chars INTEGER                               NOT NULL
      );
      CREATE INDEX IF NOT EXISTS blog_ai_usage_created_at_idx ON blog_ai_usage (created_at DESC);
      CREATE INDEX IF NOT EXISTS blog_ai_usage_user_id_idx    ON blog_ai_usage (user_id);
      CREATE INDEX IF NOT EXISTS blog_ai_usage_action_idx     ON blog_ai_usage (action);
    `,
  },
  content_folders: {
    columns: [
      "id",
      "created_at",
      "updated_at",
      "created_by",
      "name",
      "parent_id",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS content_folders (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
        created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
        name       TEXT        NOT NULL,
        parent_id  UUID        REFERENCES content_folders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS content_folders_parent_id_idx  ON content_folders (parent_id);
      CREATE INDEX IF NOT EXISTS content_folders_created_by_idx ON content_folders (created_by);
    `,
  },
  content_items: {
    columns: [
      "id",
      "created_at",
      "updated_at",
      "uploaded_by",
      "item_type",
      "title",
      "description",
      "storage_key",
      "public_url",
      "mime_type",
      "file_size",
      "duration_sec",
      "width",
      "height",
      "folder_id",
      "vt_scan_id",
      "vt_scan_status",
      "vt_scan_url",
      "vt_scan_stats",
      "vt_scanned_at",
      "mux_upload_id",
      "mux_asset_id",
      "mux_playback_id",
      "video_status",
      "video_error",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS content_items (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at     TIMESTAMPTZ NOT NULL    DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL    DEFAULT now(),
        uploaded_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
        item_type      TEXT        NOT NULL,
        title          TEXT        NOT NULL,
        description    TEXT,
        storage_key    TEXT        NOT NULL UNIQUE,
        public_url     TEXT        NOT NULL,
        mime_type      TEXT        NOT NULL,
        file_size      BIGINT      NOT NULL,
        duration_sec   INTEGER,
        width          INTEGER,
        height         INTEGER,
        folder_id      UUID        REFERENCES content_folders(id) ON DELETE SET NULL,
        vt_scan_id     TEXT,
        vt_scan_status TEXT        NOT NULL DEFAULT 'not_required'
          CHECK (vt_scan_status IN ('not_required', 'pending', 'scanning', 'clean', 'flagged', 'error')),
        vt_scan_url    TEXT,
        vt_scan_stats  JSONB,
        vt_scanned_at  TIMESTAMPTZ,
        mux_upload_id   TEXT,
        mux_asset_id    TEXT,
        mux_playback_id TEXT,
        video_status    TEXT CHECK (video_status IN ('uploading', 'processing', 'ready', 'errored')),
        video_error     TEXT
      );
      CREATE INDEX IF NOT EXISTS content_items_item_type_idx   ON content_items (item_type);
      CREATE INDEX IF NOT EXISTS content_items_uploaded_by_idx ON content_items (uploaded_by);
      CREATE INDEX IF NOT EXISTS content_items_created_at_idx  ON content_items (created_at DESC);
      CREATE INDEX IF NOT EXISTS content_items_folder_id_idx   ON content_items (folder_id);
      CREATE INDEX IF NOT EXISTS content_items_vt_pending_idx  ON content_items (vt_scan_status)
        WHERE vt_scan_status IN ('pending', 'scanning');
      CREATE INDEX IF NOT EXISTS content_items_mux_upload_id_idx ON content_items (mux_upload_id);
      CREATE INDEX IF NOT EXISTS content_items_mux_asset_id_idx  ON content_items (mux_asset_id);
      CREATE INDEX IF NOT EXISTS content_items_video_status_idx  ON content_items (video_status)
        WHERE item_type = 'video' AND video_status IN ('uploading', 'processing');
    `,
  },
  music_tracks: {
    columns: [
      "id",
      "created_at",
      "updated_at",
      "uploaded_by",
      "title",
      "artist",
      "genre",
      "duration_sec",
      "audio_key",
      "audio_url",
      "cover_key",
      "cover_url",
      "lyrics_key",
      "lyrics_url",
      "lyrics_type",
      "transliterated_lyrics_key",
      "transliterated_lyrics_url",
      "transliterated_lyrics_type",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS music_tracks (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at   TIMESTAMPTZ NOT NULL    DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL    DEFAULT now(),
        uploaded_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
        title        TEXT        NOT NULL,
        artist       TEXT        NOT NULL,
        genre        TEXT,
        duration_sec INTEGER     NOT NULL    DEFAULT 0,
        audio_key    TEXT        NOT NULL    UNIQUE,
        audio_url    TEXT        NOT NULL,
        cover_key    TEXT,
        cover_url    TEXT,
        lyrics_key   TEXT,
        lyrics_url   TEXT,
        lyrics_type  TEXT        CHECK (lyrics_type IN ('lrc', 'txt')),
        transliterated_lyrics_key  TEXT,
        transliterated_lyrics_url  TEXT,
        transliterated_lyrics_type TEXT CHECK (transliterated_lyrics_type IN ('lrc', 'txt'))
      );
      CREATE INDEX IF NOT EXISTS music_tracks_uploaded_by_idx ON music_tracks (uploaded_by);
      CREATE INDEX IF NOT EXISTS music_tracks_created_at_idx  ON music_tracks (created_at DESC);
      CREATE INDEX IF NOT EXISTS music_tracks_genre_idx       ON music_tracks (genre);
    `,
  },
  music_share_links: {
    columns: [
      "id",
      "token",
      "track_id",
      "created_by",
      "created_at",
      "expires_at",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS music_share_links (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        token      TEXT        NOT NULL UNIQUE,
        track_id   UUID        NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
        created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS music_share_links_token_idx    ON music_share_links (token);
      CREATE INDEX IF NOT EXISTS music_share_links_track_id_idx ON music_share_links (track_id);
    `,
  },
  content_share_links: {
    columns: [
      "id",
      "token",
      "content_item_id",
      "mode",
      "created_by",
      "created_at",
      "expires_at",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS content_share_links (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        token           TEXT        NOT NULL UNIQUE,
        content_item_id UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        mode            TEXT        NOT NULL CHECK (mode IN ('internal', 'external')),
        created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at      TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS content_share_links_token_idx           ON content_share_links (token);
      CREATE INDEX IF NOT EXISTS content_share_links_content_item_id_idx ON content_share_links (content_item_id);
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
    for (const [tableName, { sql: createSql, columns }] of Object.entries(
      REQUIRED_TABLES
    )) {
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
        const existingColumnNames = new Set(
          existingColumns.map((r) => r.column_name)
        )
        const missingColumns = columns.filter(
          (col) => !existingColumnNames.has(col)
        )

        if (missingColumns.length > 0) {
          console.warn(
            `[DB] Table "${tableName}" is missing columns: ${missingColumns.join(", ")}. ` +
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
    await ensureAlbumColumn(sql)
    await ensureTransliteratedLyricsColumns(sql)
    await ensureMusicPlaylistTables(sql)
    await ensureContentVideoColumns(sql)

    console.log("[DB] Schema validation complete")
  } finally {
    await sql.end()
  }
}

/** Adds Mux video metadata columns to existing content_items tables. */
async function ensureContentVideoColumns(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS mux_upload_id TEXT"
  )
  await sql.unsafe(
    "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS mux_asset_id TEXT"
  )
  await sql.unsafe(
    "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS mux_playback_id TEXT"
  )
  await sql.unsafe(`
    ALTER TABLE content_items
    ADD COLUMN IF NOT EXISTS video_status TEXT
      CHECK (video_status IN ('uploading', 'processing', 'ready', 'errored'))
  `)
  await sql.unsafe(
    "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS video_error TEXT"
  )
  await sql.unsafe(
    "CREATE INDEX IF NOT EXISTS content_items_mux_upload_id_idx ON content_items (mux_upload_id)"
  )
  await sql.unsafe(
    "CREATE INDEX IF NOT EXISTS content_items_mux_asset_id_idx ON content_items (mux_asset_id)"
  )
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS content_items_video_status_idx ON content_items (video_status)
    WHERE item_type = 'video' AND video_status IN ('uploading', 'processing')
  `)
}

/** Adds per-user login method toggles to existing databases. */
async function ensureUserLoginMethodColumns(sql: postgres.Sql): Promise<void> {
  const alters = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_passkey_enabled BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_discord_enabled BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_magic_enabled BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_qr_enabled BOOLEAN NOT NULL DEFAULT true",
  ]
  for (const stmt of alters) {
    await sql.unsafe(stmt)
  }
}

async function ensureDisplayNameColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT"
  )
}

async function ensureWelcomeWizardColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_wizard_completed_at TIMESTAMPTZ"
  )
}

/** Links invite-registration WebAuthn challenges to pending_registrations (user_id is null for that path). */
async function ensureWebAuthnPendingRegistrationColumn(
  sql: postgres.Sql
): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE webauthn_challenges
    ADD COLUMN IF NOT EXISTS pending_registration_id UUID REFERENCES pending_registrations(id) ON DELETE CASCADE
  `)
}

/** Adds album field to music tracks. */
async function ensureAlbumColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS album TEXT"
  )
}

async function ensureTransliteratedLyricsColumns(
  sql: postgres.Sql
): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS transliterated_lyrics_key TEXT"
  )
  await sql.unsafe(
    "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS transliterated_lyrics_url TEXT"
  )
  await sql.unsafe(`
    ALTER TABLE music_tracks
    ADD COLUMN IF NOT EXISTS transliterated_lyrics_type TEXT
      CHECK (transliterated_lyrics_type IN ('lrc', 'txt'))
  `)
}

/** Creates music playlist tables if they don't exist. */
async function ensureMusicPlaylistTables(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS music_playlists (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
      created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
      name        TEXT        NOT NULL,
      description TEXT
    )
  `)
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS music_playlists_created_by_idx ON music_playlists (created_by)`
  )
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS music_playlists_created_at_idx ON music_playlists (created_at DESC)`
  )
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS music_playlist_tracks (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      playlist_id UUID        NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
      track_id    UUID        NOT NULL REFERENCES music_tracks(id)    ON DELETE CASCADE,
      position    INTEGER     NOT NULL DEFAULT 0,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(playlist_id, track_id)
    )
  `)
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS music_playlist_tracks_playlist_id_idx ON music_playlist_tracks (playlist_id)`
  )
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS music_playlist_tracks_track_id_idx   ON music_playlist_tracks (track_id)`
  )
}
