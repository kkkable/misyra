import { describe, expect, it } from 'vitest';

import { createGoogleCalendarTokenCipher } from './google-calendar-token-cipher.js';

const key = Buffer.alloc(32, 7);

describe('MTS-069 Google refresh-token encryption', () => {
  it('round-trips refresh credentials without embedding plaintext in ciphertext', async () => {
    const cipher = createGoogleCalendarTokenCipher(key);

    const ciphertext = await cipher.encrypt('google-refresh-secret');

    expect(ciphertext).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(ciphertext).not.toContain('google-refresh-secret');
    await expect(cipher.decrypt(ciphertext)).resolves.toBe('google-refresh-secret');
  });

  it('uses a fresh nonce for each encryption', async () => {
    const cipher = createGoogleCalendarTokenCipher(key);

    const first = await cipher.encrypt('same-refresh-token');
    const second = await cipher.encrypt('same-refresh-token');

    expect(first).not.toBe(second);
    await expect(cipher.decrypt(first)).resolves.toBe('same-refresh-token');
    await expect(cipher.decrypt(second)).resolves.toBe('same-refresh-token');
  });

  it('rejects tampered ciphertext instead of returning unauthenticated plaintext', async () => {
    const cipher = createGoogleCalendarTokenCipher(key);
    const ciphertext = await cipher.encrypt('refresh-token');
    const [version, nonce, tag, encrypted] = ciphertext.split('.');
    const tampered = `${version}.${nonce}.${tag}.${encrypted}A`;

    await expect(cipher.decrypt(tampered)).rejects.toThrow();
  });

  it('requires exactly a 256-bit encryption key', () => {
    expect(() => createGoogleCalendarTokenCipher(Buffer.alloc(31))).toThrow(
      'Google calendar token encryption key must be 32 bytes',
    );
    expect(() => createGoogleCalendarTokenCipher(Buffer.alloc(33))).toThrow(
      'Google calendar token encryption key must be 32 bytes',
    );
  });
});
