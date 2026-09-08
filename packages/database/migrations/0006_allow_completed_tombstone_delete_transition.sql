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
       AND (to_jsonb(NEW) - ARRAY['deletion_state', 'version', 'updated_at']) =
           (to_jsonb(OLD) - ARRAY['deletion_state', 'version', 'updated_at']) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Completed occurrence fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
