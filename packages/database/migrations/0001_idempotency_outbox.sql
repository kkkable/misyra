ALTER TABLE outbox_events
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN claim_token uuid,
  ADD COLUMN last_failure_class text,
  ADD COLUMN dead_lettered_at timestamptz;

-- Account deletion may itself require durable asynchronous cleanup. Keep the
-- immutable account UUID as the ownership key after the principal row is gone
-- instead of cascading away required work or idempotency history.
ALTER TABLE outbox_events
  DROP CONSTRAINT outbox_events_account_id_fkey;

ALTER TABLE idempotency_keys
  DROP CONSTRAINT idempotency_keys_account_id_fkey;

CREATE INDEX outbox_events_dispatch_idx
  ON outbox_events(processed_at, dead_lettered_at, available_at, claimed_at);
