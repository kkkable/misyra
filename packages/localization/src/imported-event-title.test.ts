import { describe, expect, it } from 'vitest';

import { importedEventDisplayTitle } from './imported-event-title.js';

describe('MTS-055 imported event title localization', () => {
  it('uses the approved localized placeholder only for display when provider title is absent', () => {
    expect(importedEventDisplayTitle(null, 'en')).toBe('Untitled event');
    expect(importedEventDisplayTitle(null, 'zh-HK')).toBe('未命名活動');
    expect(importedEventDisplayTitle('', 'en')).toBe('Untitled event');
    expect(importedEventDisplayTitle('   ', 'zh-HK')).toBe('未命名活動');
  });

  it('shows generic provider titles unchanged', () => {
    expect(importedEventDisplayTitle('Busy', 'en')).toBe('Busy');
    expect(importedEventDisplayTitle('Busy', 'zh-HK')).toBe('Busy');
    expect(importedEventDisplayTitle('家庭活動', 'zh-HK')).toBe('家庭活動');
  });
});
