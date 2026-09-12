ALTER TABLE external_calendar_connections
  ADD COLUMN provider_calendar_id text,
  ADD COLUMN encrypted_refresh_token text,
  ADD COLUMN connection_state text NOT NULL DEFAULT 'connected';

ALTER TABLE external_calendar_connections
  ADD CONSTRAINT external_calendar_connections_state_check
  CHECK (connection_state IN ('connected', 'permission_revoked', 'provider_unavailable', 'disconnected'));

CREATE TABLE google_calendar_oauth_states (
  state_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  initial_sync_direction text NOT NULL,
  selected_calendar_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_calendar_oauth_states_hash_length_check CHECK (char_length(state_hash) = 64),
  CONSTRAINT google_calendar_oauth_states_direction_check CHECK (
    initial_sync_direction IN ('external_to_misyra', 'misyra_to_external')
  )
);
CREATE INDEX google_calendar_oauth_states_account_idx ON google_calendar_oauth_states(account_id);
CREATE INDEX google_calendar_oauth_states_expiry_idx ON google_calendar_oauth_states(expires_at);
