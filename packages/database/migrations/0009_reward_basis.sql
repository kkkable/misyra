CREATE TABLE mission_reward_basis (
  occurrence_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  difficulty text,
  base_xp integer NOT NULL,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_reward_basis_occurrence_account_fk
    FOREIGN KEY (occurrence_id, account_id)
    REFERENCES mission_occurrences(id, account_id)
    ON DELETE CASCADE,
  CONSTRAINT mission_reward_basis_difficulty_check
    CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard')),
  CONSTRAINT mission_reward_basis_base_xp_check
    CHECK (base_xp BETWEEN 0 AND 250),
  CONSTRAINT mission_reward_basis_state_check
    CHECK (
      (difficulty IS NOT NULL AND base_xp > 0 AND revoked_at IS NULL)
      OR (base_xp = 0 AND revoked_at IS NOT NULL)
    )
);

CREATE INDEX mission_reward_basis_account_idx ON mission_reward_basis(account_id);
