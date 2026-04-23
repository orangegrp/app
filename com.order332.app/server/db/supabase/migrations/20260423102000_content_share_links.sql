CREATE TABLE IF NOT EXISTS content_share_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT        NOT NULL UNIQUE,
  content_item_id UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  mode            TEXT        NOT NULL CHECK (mode IN ('internal', 'external')),
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS content_share_links_token_idx
  ON content_share_links (token);

CREATE INDEX IF NOT EXISTS content_share_links_content_item_id_idx
  ON content_share_links (content_item_id);
