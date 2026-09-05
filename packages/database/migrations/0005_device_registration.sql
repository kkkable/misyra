ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS installation_id text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS notification_capability text;

UPDATE devices
SET installation_id = COALESCE(installation_id, id::text),
    app_version = COALESCE(app_version, 'unknown'),
    notification_capability = COALESCE(notification_capability, 'not_determined');

ALTER TABLE devices
  ALTER COLUMN installation_id SET NOT NULL,
  ALTER COLUMN app_version SET NOT NULL,
  ALTER COLUMN notification_capability SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS devices_account_installation_uidx
  ON devices (account_id, installation_id);

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_notification_capability_check;
ALTER TABLE devices
  ADD CONSTRAINT devices_notification_capability_check
  CHECK (notification_capability IN ('not_determined', 'denied', 'authorized', 'unavailable'));
