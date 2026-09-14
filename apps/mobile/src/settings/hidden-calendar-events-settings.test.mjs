import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const settingsRoute = new URL('./settings-route.tsx', import.meta.url);

test('MTS-073 Settings exposes upcoming hidden events with individual restore and recurrence scope chooser', async () => {
  const source = await readFile(settingsRoute, 'utf8');

  assert.match(source, /settings-hidden-events/);
  assert.match(source, /hidden-event-restore-/);
  assert.match(source, /CalendarRecurringScopeChooser/);
  assert.doesNotMatch(source, /restore-all/i);
});
