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
  registerDeviceWithTimeZoneState?:
    | ((
        input: DeviceRegistrationRequest &
          Readonly<{
            accountId: string;
            timeZone: string;
          }>,
      ) => Promise<Readonly<{ deviceId: string; timeZoneChanged: boolean }>>)
    | undefined;
  getAccountSettings: (accountId: string) => Promise<AccountSettings>;
  getAccountSettingsWithTimeZone?:
    | ((accountId: string) => Promise<AccountSettings & Readonly<{ appTimeZone: string }>>)
    | undefined;
  updateAccountSettings: (
    accountId: string,
    settings: AccountSettingsUpdate,
  ) => Promise<AccountSettings>;
  updateAccountSettingsWithTimeZone?:
    | ((
        accountId: string,
        settings: AccountSettingsUpdate,
      ) => Promise<AccountSettings & Readonly<{ appTimeZone: string }>>)
    | undefined;
}>;

export function createDeviceSettingsService(store: DeviceRegistrationStore) {
  return {
    parseAccountSettingsUpdate(input: unknown): AccountSettingsUpdate {
      return accountSettingsUpdateSchema.parse(input);
    },

    async registerDevice(accountId: string, input: unknown): Promise<DeviceRegistrationResponse> {
      const registration = deviceRegistrationRequestSchema.parse(input);
      if (
        registration.timeZone !== undefined &&
        store.registerDeviceWithTimeZoneState !== undefined
      ) {
        return deviceRegistrationResponseSchema.parse(
          await store.registerDeviceWithTimeZoneState({ accountId, ...registration }),
        );
      }
      const deviceId = await store.registerDevice({ accountId, ...registration });
      return deviceRegistrationResponseSchema.parse({ deviceId });
    },

    async getAccountSettings(accountId: string): Promise<AccountSettings> {
      const settings =
        store.getAccountSettingsWithTimeZone === undefined
          ? await store.getAccountSettings(accountId)
          : await store.getAccountSettingsWithTimeZone(accountId);
      return accountSettingsSchema.parse(settings);
    },

    async updateAccountSettings(accountId: string, input: unknown): Promise<AccountSettings> {
      const settings = accountSettingsUpdateSchema.parse(input);
      const updated =
        store.updateAccountSettingsWithTimeZone === undefined
          ? await store.updateAccountSettings(accountId, settings)
          : await store.updateAccountSettingsWithTimeZone(accountId, settings);
      return accountSettingsSchema.parse(updated);
    },
  };
}

export type DeviceSettingsService = ReturnType<typeof createDeviceSettingsService>;
