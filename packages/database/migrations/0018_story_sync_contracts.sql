ALTER TABLE story_drafts
  ADD COLUMN notes jsonb NOT NULL DEFAULT '{"musicMood":null,"mention":null,"location":null,"poll":null}'::jsonb,
  ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN original_client_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN server_receipt_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN effective_save_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN validation_result text NOT NULL DEFAULT 'valid',
  ADD COLUMN winner_mutation_id uuid;

ALTER TABLE story_drafts
  ADD CONSTRAINT story_drafts_revision_check CHECK (revision >= 0),
  ADD CONSTRAINT story_drafts_validation_result_check
    CHECK (validation_result IN ('valid', 'invalid_replaced'));

ALTER TABLE story_image_versions
  ADD CONSTRAINT story_image_versions_draft_id_uidx UNIQUE (draft_id, id);

ALTER TABLE story_compositions
  ADD COLUMN image_version_id uuid,
  ADD COLUMN revision integer NOT NULL DEFAULT 0;

DO $story_sync$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM story_compositions composition
     WHERE NOT EXISTS (
       SELECT 1
         FROM story_image_versions version
        WHERE version.draft_id = composition.draft_id
     )
  ) THEN
    RAISE EXCEPTION 'Cannot migrate Story composition without an image version';
  END IF;
END
$story_sync$;

CREATE TEMP TABLE story_legacy_latest_compositions ON COMMIT DROP AS
SELECT DISTINCT ON (draft_id)
       draft_id,
       composition,
       saved_at
  FROM story_compositions
 ORDER BY draft_id, saved_at DESC, id DESC;

DELETE FROM story_compositions;

INSERT INTO story_compositions
  (id, draft_id, image_version_id, composition, revision, saved_at)
SELECT gen_random_uuid(),
       version.draft_id,
       version.id,
       legacy.composition,
       0,
       legacy.saved_at
  FROM story_image_versions version
  JOIN story_legacy_latest_compositions legacy
    ON legacy.draft_id = version.draft_id;

ALTER TABLE story_compositions
  ALTER COLUMN image_version_id SET NOT NULL,
  ADD CONSTRAINT story_compositions_revision_check CHECK (revision >= 0),
  ADD CONSTRAINT story_compositions_draft_image_version_fk
    FOREIGN KEY (draft_id, image_version_id)
    REFERENCES story_image_versions (draft_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT story_compositions_image_version_uidx UNIQUE (image_version_id);
