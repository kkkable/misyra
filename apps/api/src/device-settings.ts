import {
  accountSettingsSchema,
  accountSettingsUpdateSchema,
  deviceRegistrationRequestSchema,
  deviceRegistrationResponseSchema,
  type AccountSettings,
  type AccountSettingsUpdate,
  type DeviceRegistrationRequest,
  type DeviceRegistrationResponse,
} from '@misyra/contracts';

export type DeviceRegistrationStore = Readonly<{
  registerDevice: (
    input: DeviceRegistrationRequest & Readonly<{ accountId: string }>,
  ) => Promise<string>;
  getAccountSettings: (accountId: string) => Promise<AccountSettings>;
  updateAccountSettings: (
    accountId: string,
    settings: AccountSettingsUpdate,
  ) => Promise<AccountSettings>;
}>;

export function createDeviceSettingsService(store: DeviceRegistrationStore) {
  return {
    parseAccountSettingsUpdate(input: unknown): AccountSettingsUpdate {
      return accountSettingsUpdateSchema.parse(input);
    },

    async registerDevice(accountId: string, input: unknown): Promise<DeviceRegistrationResponse> {
      const registration = deviceRegistrationRequestSchema.parse(input);
      const deviceId = await store.registerDevice({ accountId, ...registration });
      return deviceRegistrationResponseSchema.parse({ deviceId });
    },

    async getAccountSettings(accountId: string): Promise<AccountSettings> {
      return accountSettingsSchema.parse(await store.getAccountSettings(accountId));
    },

    async updateAccountSettings(accountId: string, input: unknown): Promise<AccountSettings> {
      const settings = accountSettingsUpdateSchema.parse(input);
      return accountSettingsSchema.parse(await store.updateAccountSettings(accountId, settings));
    },
  };
}

export type DeviceSettingsService = ReturnType<typeof createDeviceSettingsService>;
