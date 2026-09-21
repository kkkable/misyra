ALTER TABLE media_assets
  ADD COLUMN deletion_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_deletion_attempt_at timestamptz,
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_deletion_attempt_count_check
  CHECK (deletion_attempt_count >= 0);
