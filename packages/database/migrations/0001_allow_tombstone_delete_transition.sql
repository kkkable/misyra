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
         AND (to_jsonb(NEW) - ARRAY['deletion_state', 'version', 'updated_at']) =
             (to_jsonb(OLD) - ARRAY['deletion_state', 'version', 'updated_at']) THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Tombstoned occurrence ids cannot be resurrected';
  END IF;
  RETURN NEW;
END;
$$;
