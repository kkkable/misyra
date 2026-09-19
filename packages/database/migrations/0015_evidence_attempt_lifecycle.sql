ALTER TABLE evidence_attempts
  ADD COLUMN first_submitted_at timestamptz,
  ADD COLUMN effective_submitted_at timestamptz,
  ADD COLUMN upload_status text,
  ADD COLUMN verification_status text,
  ADD COLUMN reason_code text,
  ADD COLUMN media_asset_id uuid,
  ADD COLUMN deletion_deadline timestamptz;

UPDATE evidence_attempts
   SET first_submitted_at = COALESCE(submitted_at, created_at),
       effective_submitted_at = COALESCE(submitted_at, created_at),
       upload_status = 'uploaded',
       verification_status = CASE
         WHEN status = 'accepted' THEN 'accepted'
         WHEN status = 'rejected' THEN 'rejected'
         ELSE 'pending'
       END,
       deletion_deadline = COALESCE(submitted_at, created_at) + interval '30 days';

ALTER TABLE evidence_attempts
  ALTER COLUMN first_submitted_at SET NOT NULL,
  ALTER COLUMN effective_submitted_at SET NOT NULL,
  ALTER COLUMN upload_status SET NOT NULL,
  ALTER COLUMN upload_status SET DEFAULT 'pending',
  ALTER COLUMN verification_status SET NOT NULL,
  ALTER COLUMN verification_status SET DEFAULT 'pending',
  ALTER COLUMN deletion_deadline SET NOT NULL,
  ADD CONSTRAINT evidence_attempts_upload_status_check
    CHECK (upload_status IN ('pending', 'uploaded')),
  ADD CONSTRAINT evidence_attempts_verification_status_check
    CHECK (verification_status IN ('pending', 'queued', 'accepted', 'rejected'));

CREATE INDEX evidence_attempts_media_asset_idx
  ON evidence_attempts(media_asset_id);
