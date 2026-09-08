CREATE OR REPLACE FUNCTION misyra_protect_completed_occurrence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM mission_completions
    WHERE occurrence_id = OLD.id
  ) THEN
    IF OLD.deletion_state = 'active'
       AND NEW.deletion_state = 'deleted'
       AND NEW.version = OLD.version + 1
       AND NEW.synchronization_state = 'synced'
       AND (to_jsonb(NEW) - ARRAY['deletion_state', 'synchronization_state', 'version', 'updated_at']) =
           (to_jsonb(OLD) - ARRAY['deletion_state', 'synchronization_state', 'version', 'updated_at']) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Completed occurrence fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION misyra_scrub_deleted_occurrence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.deletion_state = 'active' AND NEW.deletion_state = 'deleted' THEN
    UPDATE media_assets
       SET deletion_due_at = CASE
         WHEN deletion_due_at IS NULL OR deletion_due_at > now() THEN now()
         ELSE deletion_due_at
       END
     WHERE account_id = OLD.account_id
       AND (
         storage_key LIKE '%' || OLD.id::text || '%'
         OR storage_key IN (
           SELECT versions.storage_key
             FROM story_image_versions versions
             JOIN story_drafts drafts ON drafts.id = versions.draft_id
            WHERE drafts.account_id = OLD.account_id
              AND drafts.occurrence_id = OLD.id
         )
       );

    INSERT INTO hidden_external_events (
      account_id,
      connection_id,
      provider_event_id,
      recurrence_scope,
      hidden_at
    )
    SELECT
      OLD.account_id,
      links.connection_id,
      links.provider_event_id,
      links.recurrence_scope,
      now()
      FROM external_event_links links
     WHERE links.occurrence_id = OLD.id
       AND OLD.calendar_source = 'external'
       AND OLD.field_ownership = 'organizer_controlled'
    ON CONFLICT (connection_id, provider_event_id, recurrence_scope)
    DO UPDATE SET hidden_at = excluded.hidden_at;

    INSERT INTO outbox_events (
      account_id,
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    SELECT
      OLD.account_id,
      'external_calendar.event.delete_requested',
      'mission_occurrence',
      OLD.id,
      jsonb_build_object(
        'connectionId', links.connection_id,
        'providerEventId', links.provider_event_id,
        'recurrenceScope', links.recurrence_scope
      )
      FROM external_event_links links
     WHERE links.occurrence_id = OLD.id
       AND OLD.calendar_source = 'external'
       AND OLD.field_ownership = 'app_owned';

    DELETE FROM external_event_links
     WHERE occurrence_id = OLD.id;

    DELETE FROM mission_personal_notes
     WHERE occurrence_id = OLD.id
       AND account_id = OLD.account_id;

    DELETE FROM evidence_attempts
     WHERE occurrence_id = OLD.id
       AND account_id = OLD.account_id;

    DELETE FROM story_drafts
     WHERE occurrence_id = OLD.id
       AND account_id = OLD.account_id;

    IF NOT EXISTS (
      SELECT 1
        FROM mission_occurrences sibling
       WHERE sibling.account_id = OLD.account_id
         AND sibling.series_id = OLD.series_id
         AND sibling.id <> OLD.id
         AND sibling.deletion_state = 'active'
    ) THEN
      UPDATE mission_series
         SET title = 'Deleted mission',
             recurrence_rule = NULL,
             updated_at = now()
       WHERE id = OLD.series_id
         AND account_id = OLD.account_id;
    END IF;

    NEW.local_date := DATE '1970-01-01';
    NEW.local_start := '1970-01-01T00:00:00';
    NEW.local_finish := '1970-01-01T00:00:01';
    NEW.start_instant := TIMESTAMPTZ '1970-01-01 00:00:00+00';
    NEW.finish_instant := TIMESTAMPTZ '1970-01-01 00:00:01+00';
    NEW.time_zone := 'UTC';
    NEW.time_behavior := 'fixed_instant';
    NEW.all_day := false;
    NEW.estimated_effort_minutes := NULL;
    NEW.schedule_state := 'cancelled';
    NEW.evidence_state := 'not_required';
    NEW.reward_eligibility := 'ineligible';
    NEW.calendar_source := 'internal';
    NEW.field_ownership := 'app_owned';
    NEW.synchronization_state := 'synced';
    NEW.story_state := 'none';
    NEW.location := NULL;
    NEW.notes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mission_occurrences_delete_scrub ON mission_occurrences;
CREATE TRIGGER mission_occurrences_delete_scrub
BEFORE UPDATE OF deletion_state ON mission_occurrences
FOR EACH ROW
EXECUTE FUNCTION misyra_scrub_deleted_occurrence();

CREATE OR REPLACE FUNCTION misyra_reject_tombstoned_occurrence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM mission_occurrence_tombstones
    WHERE occurrence_id = NEW.id
  ) THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.deletion_state = 'active'
         AND NEW.deletion_state = 'deleted'
         AND NEW.version = OLD.version + 1
         AND NEW.local_date = DATE '1970-01-01'
         AND NEW.local_start = '1970-01-01T00:00:00'
         AND NEW.local_finish = '1970-01-01T00:00:01'
         AND NEW.start_instant = TIMESTAMPTZ '1970-01-01 00:00:00+00'
         AND NEW.finish_instant = TIMESTAMPTZ '1970-01-01 00:00:01+00'
         AND NEW.time_zone = 'UTC'
         AND NEW.time_behavior = 'fixed_instant'
         AND NEW.all_day = false
         AND NEW.estimated_effort_minutes IS NULL
         AND NEW.schedule_state = 'cancelled'
         AND NEW.evidence_state = 'not_required'
         AND NEW.reward_eligibility = 'ineligible'
         AND NEW.calendar_source = 'internal'
         AND NEW.field_ownership = 'app_owned'
         AND NEW.synchronization_state = 'synced'
         AND NEW.story_state = 'none'
         AND NEW.location IS NULL
         AND NEW.notes IS NULL
         AND (
           to_jsonb(NEW) - ARRAY[
             'local_date',
             'local_start',
             'local_finish',
             'start_instant',
             'finish_instant',
             'time_zone',
             'time_behavior',
             'all_day',
             'estimated_effort_minutes',
             'schedule_state',
             'evidence_state',
             'reward_eligibility',
             'calendar_source',
             'field_ownership',
             'synchronization_state',
             'story_state',
             'deletion_state',
             'location',
             'notes',
             'version',
             'updated_at'
           ]
         ) = (
           to_jsonb(OLD) - ARRAY[
             'local_date',
             'local_start',
             'local_finish',
             'start_instant',
             'finish_instant',
             'time_zone',
             'time_behavior',
             'all_day',
             'estimated_effort_minutes',
             'schedule_state',
             'evidence_state',
             'reward_eligibility',
             'calendar_source',
             'field_ownership',
             'synchronization_state',
             'story_state',
             'deletion_state',
             'location',
             'notes',
             'version',
             'updated_at'
           ]
         ) THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Tombstoned occurrence ids cannot be resurrected';
  END IF;
  RETURN NEW;
END;
$$;
