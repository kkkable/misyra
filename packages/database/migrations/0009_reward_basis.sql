ALTER TABLE mission_occurrences
  ADD COLUMN difficulty text,
  ADD COLUMN base_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN reward_revoked_at timestamptz;

ALTER TABLE mission_occurrences
  ADD CONSTRAINT mission_occurrences_difficulty_check
    CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard')),
  ADD CONSTRAINT mission_occurrences_base_xp_check
    CHECK (base_xp BETWEEN 0 AND 250),
  ADD CONSTRAINT mission_occurrences_reward_basis_state_check
    CHECK (
      (difficulty IS NULL AND base_xp = 0 AND reward_revoked_at IS NULL)
      OR (difficulty IS NOT NULL AND base_xp > 0 AND reward_revoked_at IS NULL)
      OR (base_xp = 0 AND reward_revoked_at IS NOT NULL)
    );
