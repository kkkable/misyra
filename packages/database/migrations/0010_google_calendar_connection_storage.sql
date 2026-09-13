ALTER TABLE external_calendar_connections
  ADD COLUMN provider_calendar_id text,
  ADD COLUMN encrypted_refresh_token text,
  ADD COLUMN connection_state text NOT NULL DEFAULT 'connected',
  ADD COLUMN oauth_state_hash text,
  ADD COLUMN oauth_state_expires_at timestamptz,
  ADD COLUMN oauth_state_consumed_at timestamptz;

ALTER TABLE external_calendar_connections
  ADD CONSTRAINT external_calendar_connections_state_check
  CHECK (connection_state IN ('connected', 'permission_revoked', 'provider_unavailable', 'disconnected')),
  ADD CONSTRAINT external_calendar_connections_oauth_state_check
  CHECK (
    (oauth_state_hash IS NULL AND oauth_state_expires_at IS NULL AND oauth_state_consumed_at IS NULL)
    OR (char_length(oauth_state_hash) = 64 AND oauth_state_expires_at IS NOT NULL)
  );

CREATE INDEX external_calendar_connections_oauth_state_hash_idx
  ON external_calendar_connections(oauth_state_hash)
  WHERE oauth_state_hash IS NOT NULL;
CREATE INDEX external_calendar_connections_oauth_state_expiry_idx
  ON external_calendar_connections(oauth_state_expires_at)
  WHERE oauth_state_hash IS NOT NULL AND oauth_state_consumed_at IS NULL;
