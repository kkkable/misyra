import { describe, expect, it, vi } from 'vitest';

import { createDeviceSettingsRoutes } from './device-settings-routes.js';
import { createDeviceSettingsService, type DeviceRegistrationStore } from './device-settings.js';
import { createApiServer } from './index.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';
const deviceId = '223e4567-e89b-42d3-a456-426614174000';

function fixture() {
  const registerDevice = vi.fn(() => Promise.resolve(deviceId));
  const getAccountSettings = vi.fn(() => Promise.resolve({ language: 'en' as const, trustMode: false }));
  const updateAccountSettings = vi.fn((_accountId: string, settings: { language: 'en' | 'zh-HK'; trustMode: boolean }) => Promise.resolve(settings));
  const store: DeviceRegistrationStore = { registerDevice, getAccountSettings, updateAccountSettings };
  const service = createDeviceSettingsService(store);
  return { service, registerDevice, getAccountSettings, updateAccountSettings };
}

describe('MTS-039 device and account-settings routes', () => {
  it('registers only approved device metadata for the authenticated account', async () => {
    const { service, registerDevice } = fixture();
    const server = createApiServer({
      routes: createDeviceSettingsRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        installationId: 'install-abc',
        platform: 'android',
        appVersion: '1.2.3',
        notificationCapability: 'authorized',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, payload: { deviceId } });
    expect(registerDevice).toHaveBeenCalledWith({
      accountId,
      installationId: 'install-abc',
      platform: 'android',
      appVersion: '1.2.3',
      notificationCapability: 'authorized',
    });
    await server.close();
  });

  it('shares Trust Mode and language through account-scoped settings', async () => {
    const { service, getAccountSettings, updateAccountSettings } = fixture();
    const server = createApiServer({
      routes: createDeviceSettingsRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const update = await server.inject({
      method: 'PUT',
      url: '/v1/account/settings',
      payload: { language: 'zh-HK', trustMode: true },
    });
    const read = await server.inject({ method: 'GET', url: '/v1/account/settings' });

    expect(update.statusCode).toBe(200);
    expect(updateAccountSettings).toHaveBeenCalledWith(accountId, {
      language: 'zh-HK',
      trustMode: true,
    });
    expect(read.statusCode).toBe(200);
    expect(getAccountSettings).toHaveBeenCalledWith(accountId);
    await server.close();
  });

  it('rejects device-local permission or location data and requires authentication', async () => {
    const { service, registerDevice, updateAccountSettings } = fixture();
    const authenticated = createApiServer({
      routes: createDeviceSettingsRoutes(service),
      authenticate: () => ({ accountId }),
    });

    const registration = await authenticated.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        installationId: 'install-abc',
        platform: 'ios',
        appVersion: '1.2.3',
        notificationCapability: 'authorized',
        latitude: 35.6812,
      },
    });
    const settings = await authenticated.inject({
      method: 'PUT',
      url: '/v1/account/settings',
      payload: { language: 'en', trustMode: false, cameraPermission: 'authorized' },
    });

    expect(registration.statusCode).toBe(400);
    expect(settings.statusCode).toBe(400);
    expect(registerDevice).not.toHaveBeenCalled();
    expect(updateAccountSettings).not.toHaveBeenCalled();
    await authenticated.close();

    const unauthenticated = createApiServer({
      routes: createDeviceSettingsRoutes(service),
      authenticate: () => null,
    });
    const unauthorized = await unauthenticated.inject({
      method: 'GET',
      url: '/v1/account/settings',
    });
    expect(unauthorized.statusCode).toBe(401);
    await unauthenticated.close();
  });
});
