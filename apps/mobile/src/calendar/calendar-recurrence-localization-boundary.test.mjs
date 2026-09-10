import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('MTS-051 recurrence localization boundary', () => {
  it('keeps user-visible recurrence copy out of the component source', async () => {
    const source = await readFile(
      new URL('./calendar-recurrence-editor.tsx', import.meta.url),
      'utf8',
    );

    for (const literal of [
      'Same date',
      'Ordinal weekday',
      'Interval',
      'First',
      'Second',
      'Third',
      'Fourth',
      'Last',
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      '星期日',
      '星期一',
      '星期二',
      '星期三',
      '星期四',
      '星期五',
      '星期六',
    ]) {
      expect(source).not.toContain(`'${literal}'`);
      expect(source).not.toContain(`"${literal}"`);
      expect(source).not.toContain(`>${literal}<`);
    }

    expect(source).not.toContain('placeholder="YYYY-MM-DD"');
    expect(source).not.toContain("placeholder='YYYY-MM-DD'");
  });
});
