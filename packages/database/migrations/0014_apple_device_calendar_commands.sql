CREATE OR REPLACE FUNCTION misyra_queue_apple_calendar_upsert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  apple_connection_id uuid;
BEGIN
  IF NEW.calendar_source <> 'internal'
     OR NEW.field_ownership <> 'app_owned'
     OR NEW.schedule_state <> 'scheduled'
     OR NEW.completion_state <> 'incomplete'
     OR NEW.deletion_state <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT id
    INTO apple_connection_id
    FROM external_calendar_connections
   WHERE account_id = NEW.account_id
     AND provider = 'apple'
     AND connection_state = 'connected'
     AND provider_calendar_id IS NOT NULL
   LIMIT 1;

  IF apple_connection_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO outbox_events (
    account_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) VALUES (
    NEW.account_id,
    'external_calendar.event.upsert_requested',
    'mission_occurrence',
    NEW.id,
    jsonb_build_object('connectionId', apple_connection_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mission_occurrences_apple_calendar_upsert ON mission_occurrences;
CREATE TRIGGER mission_occurrences_apple_calendar_upsert
AFTER INSERT OR UPDATE OF
  series_id,
  local_date,
  local_start,
  local_finish,
  start_instant,
  finish_instant,
  time_zone,
  time_behavior,
  all_day,
  estimated_effort_minutes,
  schedule_state,
  location,
  notes
ON mission_occurrences
FOR EACH ROW
EXECUTE FUNCTION misyra_queue_apple_calendar_upsert();
