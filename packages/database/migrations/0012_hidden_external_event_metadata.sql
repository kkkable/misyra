ALTER TABLE hidden_external_events
  ADD COLUMN provider text,
  ADD COLUMN provider_calendar_id text,
  ADD COLUMN effective_start timestamptz,
  ADD COLUMN effective_end timestamptz;

ALTER TABLE hidden_external_events
  ALTER COLUMN recurrence_scope SET DEFAULT 'this_occurrence';

UPDATE hidden_external_events hidden
   SET provider = connections.provider,
       provider_calendar_id = connections.provider_calendar_id,
       recurrence_scope = CASE
         WHEN hidden.recurrence_scope = 'event'
          AND connections.provider_calendar_id IS NOT NULL THEN 'this_occurrence'
         ELSE hidden.recurrence_scope
       END
  FROM external_calendar_connections connections
 WHERE connections.id = hidden.connection_id;

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
      provider,
      provider_calendar_id,
      provider_event_id,
      recurrence_scope,
      effective_start,
      effective_end,
      hidden_at
    )
    SELECT
      OLD.account_id,
      links.connection_id,
      connections.provider,
      connections.provider_calendar_id,
      links.provider_event_id,
      CASE
        WHEN links.recurrence_scope = 'event'
         AND connections.provider_calendar_id IS NOT NULL THEN 'this_occurrence'
        ELSE links.recurrence_scope
      END,
      CASE
        WHEN links.recurrence_scope IN ('this_occurrence', 'this_and_future')
          THEN OLD.start_instant
        ELSE NULL
      END,
      CASE
        WHEN links.recurrence_scope = 'this_occurrence' THEN OLD.finish_instant
        ELSE NULL
      END,
      now()
      FROM external_event_links links
      JOIN external_calendar_connections connections ON connections.id = links.connection_id
     WHERE links.occurrence_id = OLD.id
       AND OLD.calendar_source = 'external'
       AND OLD.field_ownership = 'organizer_controlled'
    ON CONFLICT (connection_id, provider_event_id, recurrence_scope)
    DO UPDATE SET provider = excluded.provider,
                  provider_calendar_id = excluded.provider_calendar_id,
                  effective_start = excluded.effective_start,
                  effective_end = excluded.effective_end,
                  hidden_at = excluded.hidden_at;

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
