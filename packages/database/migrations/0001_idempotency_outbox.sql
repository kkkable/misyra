ALTER TABLE outbox_events
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN claim_token uuid,
  ADD COLUMN last_failure_class text,
  ADD COLUMN dead_lettered_at timestamptz;

CREATE INDEX outbox_events_dispatch_idx
  ON outbox_events(processed_at, dead_lettered_at, available_at, claimed_at);
