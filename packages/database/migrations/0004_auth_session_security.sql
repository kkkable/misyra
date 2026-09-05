ALTER TABLE accounts
  ADD COLUMN consumed_provider_nonce_hashes text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE account_sessions
  ADD COLUMN family_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN rotated_refresh_token_hashes text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX account_sessions_family_idx ON account_sessions(family_id);
