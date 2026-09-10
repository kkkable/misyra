import { z } from 'zod';

import { uuidSchema } from './shared.js';

function isIanaTimeZone(value: string): boolean {
  const firstCharacter = value.at(0);
  if (firstCharacter === '+' || firstCharacter === '-' || firstCharacter === '−') return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(isIanaTimeZone, { message: 'Time zone must be a valid IANA identifier.' });

export const devicePlatformSchema = z.enum(['ios', 'android']);
export const notificationCapabilitySchema = z.enum([
  'not_determined',
  'denied',
  'authorized',
  'unavailable',
]);

export const deviceRegistrationRequestSchema = z
  .object({
    installationId: z.string().trim().min(1).max(128),
    platform: devicePlatformSchema,
    appVersion: z.string().trim().min(1).max(64),
    notificationCapability: notificationCapabilitySchema,
    timeZone: ianaTimeZoneSchema.optional(),
  })
  .strict();

export const deviceRegistrationResponseSchema = z
  .object({
    deviceId: uuidSchema,
    timeZoneChanged: z.boolean().optional(),
  })
  .strict();

export const accountSettingsSchema = z
  .object({
    language: z.enum(['en', 'zh-HK']),
    trustMode: z.boolean(),
    appTimeZone: ianaTimeZoneSchema.optional(),
  })
  .strict();

export const accountSettingsUpdateSchema = accountSettingsSchema
  .partial()
  .refine(
    (value) =>
      value.language !== undefined ||
      value.trustMode !== undefined ||
      value.appTimeZone !== undefined,
    {
      message: 'At least one account setting is required.',
    },
  );

export type DeviceRegistrationRequest = z.infer<typeof deviceRegistrationRequestSchema>;
export type DeviceRegistrationResponse = z.infer<typeof deviceRegistrationResponseSchema>;
export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type AccountSettingsUpdate = z.infer<typeof accountSettingsUpdateSchema>;
