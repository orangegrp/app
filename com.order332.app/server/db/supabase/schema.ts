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
      "mail_setup_completed_at",
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
        welcome_wizard_completed_at TIMESTAMPTZ,
        mail_setup_completed_at TIMESTAMPTZ
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
      "location",
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
        user_agent TEXT,
        location TEXT
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
      "otp",
      "mobile_acknowledged",
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
  mailboxes: {
    columns: [
      "id",
      "owner_user_id",
      "primary_email",
      "display_name",
      "is_active",
      "created_at",
      "updated_at",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS mailboxes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        primary_email TEXT NOT NULL,
        display_name TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(owner_user_id, primary_email)
      );
      CREATE INDEX IF NOT EXISTS mailboxes_owner_user_id_idx ON mailboxes(owner_user_id);
      CREATE INDEX IF NOT EXISTS mailboxes_primary_email_idx ON mailboxes(primary_email);
    `,
  },
  mail_aliases: {
    columns: [
      "id",
      "mailbox_id",
      "owner_user_id",
      "alias_email",
      "created_at",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS mail_aliases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alias_email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(alias_email),
        UNIQUE(mailbox_id, alias_email)
      );
      CREATE INDEX IF NOT EXISTS mail_aliases_mailbox_id_idx ON mail_aliases(mailbox_id);
      CREATE INDEX IF NOT EXISTS mail_aliases_owner_user_id_idx ON mail_aliases(owner_user_id);
    `,
  },
  mail_messages: {
    columns: [
      "id",
      "owner_user_id",
      "mailbox_id",
      "direction",
      "folder",
      "resend_message_id",
      "resend_inbound_message_id",
      "thread_ref",
      "subject",
      "from_address",
      "to_addresses",
      "cc_addresses",
      "bcc_addresses",
      "body_text",
      "body_html",
      "snippet",
      "received_at",
      "sent_at",
      "is_read",
      "has_attachments",
      "delivery_status",
      "last_delivery_event_at",
      "last_delivery_event_type",
      "last_delivery_error",
      "complained_at",
      "suppressed_at",
      "open_count",
      "click_count",
      "created_at",
      "updated_at",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS mail_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent')),
        resend_message_id TEXT,
        resend_inbound_message_id TEXT,
        thread_ref TEXT,
        subject TEXT NOT NULL DEFAULT '',
        from_address TEXT NOT NULL,
        to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
        cc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
        bcc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
        body_text TEXT,
        body_html TEXT,
        snippet TEXT,
        received_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        is_read BOOLEAN NOT NULL DEFAULT false,
        has_attachments BOOLEAN NOT NULL DEFAULT false,
        delivery_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (delivery_status IN ('pending', 'scheduled', 'sent', 'delivered', 'delivery_delayed', 'failed', 'bounced', 'suppressed')),
        last_delivery_event_at TIMESTAMPTZ,
        last_delivery_event_type TEXT,
        last_delivery_error TEXT,
        complained_at TIMESTAMPTZ,
        suppressed_at TIMESTAMPTZ,
        open_count INTEGER NOT NULL DEFAULT 0,
        click_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(owner_user_id, resend_message_id),
        UNIQUE(owner_user_id, resend_inbound_message_id)
      );
      CREATE INDEX IF NOT EXISTS mail_messages_owner_folder_created_idx
        ON mail_messages(owner_user_id, folder, created_at DESC);
      CREATE INDEX IF NOT EXISTS mail_messages_owner_read_created_idx
        ON mail_messages(owner_user_id, is_read, created_at DESC);
      CREATE INDEX IF NOT EXISTS mail_messages_mailbox_id_idx ON mail_messages(mailbox_id);
      CREATE INDEX IF NOT EXISTS mail_messages_thread_ref_idx ON mail_messages(thread_ref);
      CREATE INDEX IF NOT EXISTS mail_messages_delivery_status_idx ON mail_messages(delivery_status);
      CREATE INDEX IF NOT EXISTS mail_messages_last_delivery_event_at_idx ON mail_messages(last_delivery_event_at DESC);
    `,
  },
  mail_attachments: {
    columns: [
      "id",
      "owner_user_id",
      "message_id",
      "storage_key",
      "file_name",
      "mime_type",
      "size_bytes",
      "content_id",
      "is_inline",
      "created_at",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS mail_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
        content_id TEXT,
        is_inline BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS mail_attachments_owner_user_id_idx ON mail_attachments(owner_user_id);
      CREATE INDEX IF NOT EXISTS mail_attachments_message_id_idx ON mail_attachments(message_id);
    `,
  },
  mail_webhook_events: {
    columns: [
      "id",
      "provider",
      "event_id",
      "event_type",
      "received_at",
      "processed_at",
      "payload_sha256",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS mail_webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ,
        payload_sha256 TEXT,
        UNIQUE(provider, event_id)
      );
      CREATE INDEX IF NOT EXISTS mail_webhook_events_event_type_idx ON mail_webhook_events(event_type);
    `,
  },
  mail_message_events: {
    columns: [
      "id",
      "owner_user_id",
      "message_id",
      "resend_message_id",
      "event_type",
      "event_at",
      "recipient",
      "url",
      "user_agent",
      "ip_address",
      "details",
      "webhook_event_id",
      "created_at",
    ],
    sql: `
      CREATE TABLE IF NOT EXISTS mail_message_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
        resend_message_id TEXT,
        event_type TEXT NOT NULL,
        event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        recipient TEXT,
        url TEXT,
        user_agent TEXT,
        ip_address TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        webhook_event_id UUID REFERENCES mail_webhook_events(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS mail_message_events_owner_user_id_idx ON mail_message_events(owner_user_id);
      CREATE INDEX IF NOT EXISTS mail_message_events_message_id_idx ON mail_message_events(message_id);
      CREATE INDEX IF NOT EXISTS mail_message_events_event_type_idx ON mail_message_events(event_type);
      CREATE INDEX IF NOT EXISTS mail_message_events_event_at_idx ON mail_message_events(event_at DESC);
      CREATE INDEX IF NOT EXISTS mail_message_events_resend_message_id_idx ON mail_message_events(resend_message_id);
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
    await ensureQrOtpColumn(sql)
    await ensureQrMobileAcknowledgedColumn(sql)
    await ensureSessionLocationColumn(sql)
    await ensureMailSecurity(sql)

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

/** Adds OTP column to qr_login_sessions for the mutual-presence verification step. */
async function ensureQrOtpColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE qr_login_sessions ADD COLUMN IF NOT EXISTS otp TEXT"
  )
}

/** Adds mobile_acknowledged flag — set when mobile polls /mobile-status after otp-verified; blocks old clients from approving without going through the OTP display step. */
async function ensureQrMobileAcknowledgedColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE qr_login_sessions ADD COLUMN IF NOT EXISTS mobile_acknowledged BOOLEAN NOT NULL DEFAULT false"
  )
}

/** Adds location column to sessions for displaying session origin in account settings. */
async function ensureSessionLocationColumn(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location TEXT"
  )
}

async function ensureMailSecurity(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION public.current_request_user_id()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT CASE
        WHEN current_setting('request.jwt.claim.sub', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN current_setting('request.jwt.claim.sub', true)::uuid
        ELSE NULL
      END
    $$
  `)

  await sql.unsafe("ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY")
  await sql.unsafe("ALTER TABLE mail_aliases ENABLE ROW LEVEL SECURITY")
  await sql.unsafe("ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY")
  await sql.unsafe("ALTER TABLE mail_attachments ENABLE ROW LEVEL SECURITY")
  await sql.unsafe("ALTER TABLE mail_webhook_events ENABLE ROW LEVEL SECURITY")
  await sql.unsafe("ALTER TABLE mail_message_events ENABLE ROW LEVEL SECURITY")

  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_select'
      ) THEN
        CREATE POLICY mailboxes_owner_select ON mailboxes
          FOR SELECT USING (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_insert'
      ) THEN
        CREATE POLICY mailboxes_owner_insert ON mailboxes
          FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_update'
      ) THEN
        CREATE POLICY mailboxes_owner_update ON mailboxes
          FOR UPDATE USING (owner_user_id = public.current_request_user_id())
          WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mailboxes' AND policyname = 'mailboxes_owner_delete'
      ) THEN
        CREATE POLICY mailboxes_owner_delete ON mailboxes
          FOR DELETE USING (owner_user_id = public.current_request_user_id());
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_select'
      ) THEN
        CREATE POLICY mail_aliases_owner_select ON mail_aliases
          FOR SELECT USING (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_insert'
      ) THEN
        CREATE POLICY mail_aliases_owner_insert ON mail_aliases
          FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_update'
      ) THEN
        CREATE POLICY mail_aliases_owner_update ON mail_aliases
          FOR UPDATE USING (owner_user_id = public.current_request_user_id())
          WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_aliases' AND policyname = 'mail_aliases_owner_delete'
      ) THEN
        CREATE POLICY mail_aliases_owner_delete ON mail_aliases
          FOR DELETE USING (owner_user_id = public.current_request_user_id());
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_select'
      ) THEN
        CREATE POLICY mail_messages_owner_select ON mail_messages
          FOR SELECT USING (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_insert'
      ) THEN
        CREATE POLICY mail_messages_owner_insert ON mail_messages
          FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_update'
      ) THEN
        CREATE POLICY mail_messages_owner_update ON mail_messages
          FOR UPDATE USING (owner_user_id = public.current_request_user_id())
          WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_messages' AND policyname = 'mail_messages_owner_delete'
      ) THEN
        CREATE POLICY mail_messages_owner_delete ON mail_messages
          FOR DELETE USING (owner_user_id = public.current_request_user_id());
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_select'
      ) THEN
        CREATE POLICY mail_attachments_owner_select ON mail_attachments
          FOR SELECT USING (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_insert'
      ) THEN
        CREATE POLICY mail_attachments_owner_insert ON mail_attachments
          FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_update'
      ) THEN
        CREATE POLICY mail_attachments_owner_update ON mail_attachments
          FOR UPDATE USING (owner_user_id = public.current_request_user_id())
          WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_attachments' AND policyname = 'mail_attachments_owner_delete'
      ) THEN
        CREATE POLICY mail_attachments_owner_delete ON mail_attachments
          FOR DELETE USING (owner_user_id = public.current_request_user_id());
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_message_events' AND policyname = 'mail_message_events_owner_select'
      ) THEN
        CREATE POLICY mail_message_events_owner_select ON mail_message_events
          FOR SELECT USING (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_message_events' AND policyname = 'mail_message_events_owner_insert'
      ) THEN
        CREATE POLICY mail_message_events_owner_insert ON mail_message_events
          FOR INSERT WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_message_events' AND policyname = 'mail_message_events_owner_update'
      ) THEN
        CREATE POLICY mail_message_events_owner_update ON mail_message_events
          FOR UPDATE USING (owner_user_id = public.current_request_user_id())
          WITH CHECK (owner_user_id = public.current_request_user_id());
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mail_message_events' AND policyname = 'mail_message_events_owner_delete'
      ) THEN
        CREATE POLICY mail_message_events_owner_delete ON mail_message_events
          FOR DELETE USING (owner_user_id = public.current_request_user_id());
      END IF;
    END
    $$
  `)

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION public.mail_increment_open_count(message_id_in UUID, increment_by INTEGER DEFAULT 1)
    RETURNS VOID
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      UPDATE mail_messages
      SET open_count = GREATEST(0, open_count + GREATEST(1, increment_by)),
          updated_at = now()
      WHERE id = message_id_in;
    $$
  `)

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION public.mail_increment_click_count(message_id_in UUID, increment_by INTEGER DEFAULT 1)
    RETURNS VOID
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      UPDATE mail_messages
      SET click_count = GREATEST(0, click_count + GREATEST(1, increment_by)),
          updated_at = now()
      WHERE id = message_id_in;
    $$
  `)

  await sql.unsafe("REVOKE ALL ON FUNCTION public.mail_increment_open_count(UUID, INTEGER) FROM PUBLIC")
  await sql.unsafe("REVOKE ALL ON FUNCTION public.mail_increment_click_count(UUID, INTEGER) FROM PUBLIC")
  await sql.unsafe("GRANT EXECUTE ON FUNCTION public.mail_increment_open_count(UUID, INTEGER) TO authenticated, service_role")
  await sql.unsafe("GRANT EXECUTE ON FUNCTION public.mail_increment_click_count(UUID, INTEGER) TO authenticated, service_role")

  await sql.unsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'mail_messages'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_messages;
      END IF;
    END
    $$
  `)
}
