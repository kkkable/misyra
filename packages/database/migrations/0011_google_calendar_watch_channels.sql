CREATE SCHEMA IF NOT EXISTS misyra_internal;

CREATE TABLE misyra_internal.google_calendar_watch_channels (
  channel_id text PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.external_calendar_connections(id) ON DELETE CASCADE,
  resource_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  renewal_claimed_until timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_calendar_watch_channels_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX google_calendar_watch_channels_current_connection_uidx
  ON misyra_internal.google_calendar_watch_channels (connection_id)
  WHERE superseded_at IS NULL;

CREATE INDEX google_calendar_watch_channels_renewal_idx
  ON misyra_internal.google_calendar_watch_channels (expires_at, renewal_claimed_until, connection_id)
  WHERE superseded_at IS NULL;

CREATE TABLE misyra_internal.google_calendar_watch_signals (
  channel_id text NOT NULL
    REFERENCES misyra_internal.google_calendar_watch_channels(channel_id) ON DELETE CASCADE,
  message_number text NOT NULL,
  resource_state text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, message_number),
  CONSTRAINT google_calendar_watch_signals_message_number_check
    CHECK (message_number ~ '^[0-9]+$')
);

CREATE TABLE misyra_internal.google_calendar_watch_repair_claims (
  connection_id uuid PRIMARY KEY
    REFERENCES public.external_calendar_connections(id) ON DELETE CASCADE,
  claimed_until timestamptz NOT NULL
);
