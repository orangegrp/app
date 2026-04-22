-- Content Library video support (Mux direct uploads + signed playback)

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS mux_upload_id   TEXT,
  ADD COLUMN IF NOT EXISTS mux_asset_id    TEXT,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT,
  ADD COLUMN IF NOT EXISTS video_status    TEXT
    CHECK (video_status IN ('uploading', 'processing', 'ready', 'errored')),
  ADD COLUMN IF NOT EXISTS video_error     TEXT;

CREATE INDEX IF NOT EXISTS content_items_mux_upload_id_idx   ON content_items (mux_upload_id);
CREATE INDEX IF NOT EXISTS content_items_mux_asset_id_idx    ON content_items (mux_asset_id);
CREATE INDEX IF NOT EXISTS content_items_video_status_idx    ON content_items (video_status)
  WHERE item_type = 'video' AND video_status IN ('uploading', 'processing');
