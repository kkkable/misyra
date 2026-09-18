ALTER TABLE media_assets
  ADD COLUMN original_storage_key text,
  ADD COLUMN thumbnail_storage_key text,
  ADD COLUMN derivative_storage_key text,
  ADD COLUMN temporary_storage_key text,
  ADD COLUMN deletion_state text NOT NULL DEFAULT 'active',
  ADD COLUMN retry_state text NOT NULL DEFAULT 'ready';

UPDATE media_assets
   SET original_storage_key = storage_key
 WHERE original_storage_key IS NULL;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_purpose_check
  CHECK (purpose IN (
    'evidence-working',
    'story-working',
    'planner-working',
    'style-references'
  )),
  ADD CONSTRAINT media_assets_deletion_state_check
  CHECK (deletion_state IN ('active', 'deleting', 'deleted')),
  ADD CONSTRAINT media_assets_retry_state_check
  CHECK (retry_state IN ('ready', 'retry_pending', 'exhausted'));
