import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { GoogleCalendarTokenCipher } from './google-calendar-connection.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const VERSION = 'v1';
const ADDITIONAL_AUTHENTICATED_DATA = Buffer.from('misyra.google-calendar.refresh-token.v1');

function decodeSegment(value: string, expectedBytes: number | null): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid Google calendar token ciphertext');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length === 0 || (expectedBytes !== null && decoded.length !== expectedBytes)) {
    throw new Error('Invalid Google calendar token ciphertext');
  }
  return decoded;
}

export function createGoogleCalendarTokenCipher(key: Uint8Array): GoogleCalendarTokenCipher {
  const encryptionKey = Buffer.from(key);
  if (encryptionKey.length !== KEY_BYTES) {
    throw new Error('Google calendar token encryption key must be 32 bytes');
  }

  return {
    encrypt(plaintext) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, encryptionKey, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      cipher.setAAD(ADDITIONAL_AUTHENTICATED_DATA);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return Promise.resolve(
        [VERSION, nonce.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join(
          '.',
        ),
      );
    },

    decrypt(ciphertext) {
      const segments = ciphertext.split('.');
      if (segments.length !== 4 || segments[0] !== VERSION) {
        return Promise.reject(new Error('Invalid Google calendar token ciphertext'));
      }
      const [, nonceSegment, authTagSegment, encryptedSegment] = segments;
      if (!nonceSegment || !authTagSegment || !encryptedSegment) {
        return Promise.reject(new Error('Invalid Google calendar token ciphertext'));
      }

      try {
        const nonce = decodeSegment(nonceSegment, NONCE_BYTES);
        const authTag = decodeSegment(authTagSegment, AUTH_TAG_BYTES);
        const encrypted = decodeSegment(encryptedSegment, null);
        const decipher = createDecipheriv(ALGORITHM, encryptionKey, nonce, {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(ADDITIONAL_AUTHENTICATED_DATA);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        return Promise.resolve(plaintext);
      } catch (error) {
        return Promise.reject(new Error('Google calendar token decryption failed', { cause: error }));
      }
    },
  };
}
