CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_provider_check CHECK (provider IN ('apple', 'google')),
  CONSTRAINT accounts_provider_subject_unique UNIQUE (provider, provider_subject)
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_account_idx ON devices(account_id);

CREATE TABLE account_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  refresh_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_sessions_refresh_hash_unique UNIQUE (refresh_token_hash)
);
CREATE INDEX account_sessions_account_idx ON account_sessions(account_id);

CREATE TABLE user_settings (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'en',
  trust_mode boolean NOT NULL DEFAULT false,
  app_time_zone text NOT NULL DEFAULT 'UTC',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mission_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  recurrence_rule jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_series_account_idx ON mission_series(account_id);

CREATE TABLE mission_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  series_id uuid REFERENCES mission_series(id) ON DELETE SET NULL,
  local_date date NOT NULL,
  local_start text,
  local_finish text,
  start_instant timestamptz,
  finish_instant timestamptz,
  time_zone text NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  location text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_occurrences_account_date_idx ON mission_occurrences(account_id, local_date);
CREATE INDEX mission_occurrences_series_idx ON mission_occurrences(series_id);

CREATE TABLE mission_occurrence_tombstones (
  occurrence_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL,
  reason text
);
CREATE INDEX mission_occurrence_tombstones_account_idx ON mission_occurrence_tombstones(account_id);

CREATE TABLE mission_personal_notes (
  occurrence_id uuid PRIMARY KEY REFERENCES mission_occurrences(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  note text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_personal_notes_account_idx ON mission_personal_notes(account_id);

CREATE TABLE mission_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES mission_occurrences(id) ON DELETE CASCADE,
  completion_type text NOT NULL,
  action_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_completions_occurrence_unique UNIQUE (occurrence_id)
);
CREATE INDEX mission_completions_account_idx ON mission_completions(account_id);

CREATE TABLE evidence_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES mission_occurrences(id) ON DELETE CASCADE,
  attempt_number smallint NOT NULL,
  status text NOT NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_attempts_number_check CHECK (attempt_number BETWEEN 1 AND 3),
  CONSTRAINT evidence_attempts_occurrence_attempt_unique UNIQUE (occurrence_id, attempt_number)
);
CREATE INDEX evidence_attempts_account_idx ON evidence_attempts(account_id);

CREATE TABLE reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES mission_occurrences(id) ON DELETE CASCADE,
  base_xp integer NOT NULL,
  proof_bonus_xp integer NOT NULL,
  awarded_xp integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_ledger_occurrence_unique UNIQUE (occurrence_id)
);
CREATE INDEX reward_ledger_account_idx ON reward_ledger(account_id);

CREATE TABLE streak_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  state text NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT streak_days_account_date_unique UNIQUE (account_id, local_date)
);

CREATE TABLE story_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES mission_occurrences(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'active',
  ai_generation_count smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_drafts_ai_generation_count_check CHECK (ai_generation_count BETWEEN 0 AND 3)
);
CREATE UNIQUE INDEX story_drafts_active_occurrence_uidx ON story_drafts(occurrence_id) WHERE state = 'active';
CREATE INDEX story_drafts_account_idx ON story_drafts(account_id);

CREATE TABLE story_image_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES story_drafts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_image_versions_draft_idx ON story_image_versions(draft_id);

CREATE TABLE story_compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES story_drafts(id) ON DELETE CASCADE,
  composition jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_compositions_draft_idx ON story_compositions(draft_id);

CREATE TABLE story_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_style_profiles_account_unique UNIQUE (account_id)
);

CREATE TABLE ai_planner_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_planner_drafts_account_unique UNIQUE (account_id)
);

CREATE TABLE ai_planner_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES ai_planner_drafts(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  payload jsonb NOT NULL,
  CONSTRAINT ai_planner_items_draft_ordinal_unique UNIQUE (draft_id, ordinal)
);

CREATE TABLE external_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  sync_direction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_calendar_connections_account_unique UNIQUE (account_id)
);

CREATE TABLE external_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES external_calendar_connections(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES mission_occurrences(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  recurrence_scope text NOT NULL DEFAULT 'event',
  CONSTRAINT external_event_links_provider_scope_unique UNIQUE (
    connection_id,
    provider_event_id,
    recurrence_scope
  )
);
CREATE INDEX external_event_links_occurrence_idx ON external_event_links(occurrence_id);

CREATE TABLE hidden_external_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES external_calendar_connections(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  recurrence_scope text NOT NULL DEFAULT 'event',
  hidden_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hidden_external_events_provider_scope_unique UNIQUE (
    connection_id,
    provider_event_id,
    recurrence_scope
  )
);
CREATE INDEX hidden_external_events_account_idx ON hidden_external_events(account_id);

CREATE TABLE calendar_sync_cursors (
  connection_id uuid PRIMARY KEY REFERENCES external_calendar_connections(id) ON DELETE CASCADE,
  cursor text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE device_sync_mutations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  operation text NOT NULL,
  base_version integer,
  client_occurred_at timestamptz NOT NULL,
  server_receipt_time timestamptz NOT NULL,
  effective_time timestamptz NOT NULL,
  validation_result text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_sync_mutations_account_idx ON device_sync_mutations(account_id);
CREATE INDEX device_sync_mutations_device_idx ON device_sync_mutations(device_id);

CREATE TABLE account_change_log (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  operation text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_change_log_account_sequence_unique UNIQUE (account_id, sequence)
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  storage_key text NOT NULL,
  deletion_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_account_idx ON media_assets(account_id);
CREATE INDEX media_assets_deletion_due_idx ON media_assets(deletion_due_at);

CREATE TABLE feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  email text,
  description text NOT NULL,
  technical_details jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_reports_account_idx ON feedback_reports(account_id);

CREATE TABLE feedback_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_report_id uuid NOT NULL REFERENCES feedback_reports(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_media_assets_report_idx ON feedback_media_assets(feedback_report_id);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_events_account_idx ON outbox_events(account_id);
CREATE INDEX outbox_events_processed_available_idx ON outbox_events(processed_at, available_at);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_account_key_unique UNIQUE (account_id, key)
);

CREATE OR REPLACE FUNCTION misyra_protect_occurrence_tombstone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id) THEN
    RAISE EXCEPTION 'Occurrence tombstones are permanent while the account exists';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER mission_occurrence_tombstones_permanent
BEFORE DELETE ON mission_occurrence_tombstones
FOR EACH ROW
EXECUTE FUNCTION misyra_protect_occurrence_tombstone();

CREATE OR REPLACE FUNCTION misyra_protect_completed_occurrence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM mission_completions WHERE occurrence_id = OLD.id) THEN
    RAISE EXCEPTION 'Completed occurrence fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mission_occurrences_completed_immutable
BEFORE UPDATE ON mission_occurrences
FOR EACH ROW
EXECUTE FUNCTION misyra_protect_completed_occurrence();
