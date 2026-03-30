-- Preset permissions on invite codes (applied when the invited user registers).
-- Run manually on existing deployments when ready.

ALTER TABLE invite_codes
  ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT '';
