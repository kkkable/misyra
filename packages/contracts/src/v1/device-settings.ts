import { z } from 'zod';

import { uuidSchema } from './shared.js';

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
  })
  .strict();

export const deviceRegistrationResponseSchema = z
  .object({
    deviceId: uuidSchema,
  })
  .strict();

export const accountSettingsSchema = z
  .object({
    language: z.enum(['en', 'zh-HK']),
    trustMode: z.boolean(),
  })
  .strict();

export const accountSettingsUpdateSchema = accountSettingsSchema;

export type DeviceRegistrationRequest = z.infer<typeof deviceRegistrationRequestSchema>;
export type DeviceRegistrationResponse = z.infer<typeof deviceRegistrationResponseSchema>;
export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type AccountSettingsUpdate = z.infer<typeof accountSettingsUpdateSchema>;
