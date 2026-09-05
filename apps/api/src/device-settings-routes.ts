import {
  accountSettingsSchema,
  accountSettingsUpdateSchema,
  deviceRegistrationRequestSchema,
  deviceRegistrationResponseSchema,
} from '@misyra/contracts';

import type { DeviceSettingsService } from './device-settings.js';
import { ApiError, type ApiRouteDefinition } from './index.js';

function parseRegistrationBody(value: unknown) {
  const parsed = deviceRegistrationRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

function parseSettingsBody(value: unknown) {
  const parsed = accountSettingsUpdateSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('validation_failed');
  return parsed.data;
}

export function createDeviceSettingsRoutes(
  service: DeviceSettingsService,
): ApiRouteDefinition[] {
  return [
    {
      method: 'POST',
      path: '/devices/register',
      handler: async (request, _reply, auth) =>
        deviceRegistrationResponseSchema.parse(
          await service.registerDevice(auth.accountId, parseRegistrationBody(request.body)),
        ),
    },
    {
      method: 'GET',
      path: '/account/settings',
      handler: async (_request, _reply, auth) =>
        accountSettingsSchema.parse(await service.getAccountSettings(auth.accountId)),
    },
    {
      method: 'PATCH',
      path: '/account/settings',
      handler: async (request, _reply, auth) =>
        accountSettingsSchema.parse(
          await service.updateAccountSettings(auth.accountId, parseSettingsBody(request.body)),
        ),
    },
  ];
}
