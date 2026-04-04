-- Folder hierarchy (unlimited nesting via parent_id self-reference)
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

-- Add folder + VirusTotal columns to existing content_items
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS folder_id      UUID REFERENCES content_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vt_scan_id     TEXT,
  ADD COLUMN IF NOT EXISTS vt_scan_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (vt_scan_status IN ('not_required', 'pending', 'scanning', 'clean', 'flagged', 'error')),
  ADD COLUMN IF NOT EXISTS vt_scan_url    TEXT,
  ADD COLUMN IF NOT EXISTS vt_scan_stats  JSONB,
  ADD COLUMN IF NOT EXISTS vt_scanned_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS content_items_folder_id_idx  ON content_items (folder_id);
-- Partial index: only rows that still need polling
CREATE INDEX IF NOT EXISTS content_items_vt_pending_idx ON content_items (vt_scan_status)
  WHERE vt_scan_status IN ('pending', 'scanning');
