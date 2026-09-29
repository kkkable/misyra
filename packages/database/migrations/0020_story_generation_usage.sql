CREATE TABLE story_generation_usage (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL,
  ai_generation_count smallint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_generation_usage_pkey PRIMARY KEY (account_id, occurrence_id),
  CONSTRAINT story_generation_usage_occurrence_account_fk
    FOREIGN KEY (occurrence_id, account_id)
    REFERENCES mission_occurrences(id, account_id)
    ON DELETE CASCADE,
  CONSTRAINT story_generation_usage_count_check
    CHECK (ai_generation_count BETWEEN 0 AND 3)
);

INSERT INTO story_generation_usage (account_id, occurrence_id, ai_generation_count)
SELECT account_id, occurrence_id, MAX(ai_generation_count)::smallint
  FROM story_drafts
 GROUP BY account_id, occurrence_id
ON CONFLICT (account_id, occurrence_id) DO UPDATE
SET ai_generation_count = GREATEST(
      story_generation_usage.ai_generation_count,
      EXCLUDED.ai_generation_count
    ),
    updated_at = now();
