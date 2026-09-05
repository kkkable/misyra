ALTER TABLE account_sessions
  ADD COLUMN family_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX account_sessions_family_idx ON account_sessions(family_id);

CREATE TABLE provider_proof_nonces (
  provider text NOT NULL,
  provider_subject text NOT NULL,
  nonce_hash text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_proof_nonces_provider_check CHECK (provider IN ('apple', 'google')),
  CONSTRAINT provider_proof_nonces_unique UNIQUE (provider, provider_subject, nonce_hash)
);

CREATE TABLE account_session_rotated_tokens (
  refresh_token_hash text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES account_sessions(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_session_rotated_tokens_session_idx
  ON account_session_rotated_tokens(session_id);
CREATE INDEX account_session_rotated_tokens_family_idx
  ON account_session_rotated_tokens(family_id);
