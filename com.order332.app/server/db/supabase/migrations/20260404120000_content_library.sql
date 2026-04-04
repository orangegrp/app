-- Content Library + Music tracks tables
-- Run this migration against your Supabase database via the dashboard SQL editor or psql.

-- ── content_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL    DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL    DEFAULT now(),
  uploaded_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  item_type    TEXT        NOT NULL,   -- 'image' | 'audio' | 'pdf' | 'download'
  title        TEXT        NOT NULL,
  description  TEXT,
  storage_key  TEXT        NOT NULL UNIQUE,
  public_url   TEXT        NOT NULL,
  mime_type    TEXT        NOT NULL,
  file_size    BIGINT      NOT NULL,
  duration_sec INTEGER,               -- non-null for audio items
  width        INTEGER,               -- non-null for image items
  height       INTEGER                -- non-null for image items
);

CREATE INDEX IF NOT EXISTS content_items_item_type_idx   ON content_items (item_type);
CREATE INDEX IF NOT EXISTS content_items_uploaded_by_idx ON content_items (uploaded_by);
CREATE INDEX IF NOT EXISTS content_items_created_at_idx  ON content_items (created_at DESC);

-- ── music_tracks ──────────────────────────────────────────────────────────────
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
  lyrics_type  TEXT        CHECK (lyrics_type IN ('lrc', 'txt'))
);

CREATE INDEX IF NOT EXISTS music_tracks_uploaded_by_idx ON music_tracks (uploaded_by);
CREATE INDEX IF NOT EXISTS music_tracks_created_at_idx  ON music_tracks (created_at DESC);
CREATE INDEX IF NOT EXISTS music_tracks_genre_idx       ON music_tracks (genre);
