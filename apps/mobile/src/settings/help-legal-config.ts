export type HelpLegalConfiguration = Readonly<{
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  appVersion: string;
}>;

function httpsUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (candidate.length === 0) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0) return null;
    return candidate;
  } catch {
    return null;
  }
}

function appVersion(value: string | undefined): string {
  if (typeof value !== 'string') return '0.0.0';
  const candidate = value.trim();
  return candidate.length > 0 ? candidate : '0.0.0';
}

export function resolveHelpLegalConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
): HelpLegalConfiguration {
  return Object.freeze({
    privacyPolicyUrl: httpsUrl(env.EXPO_PUBLIC_PRIVACY_POLICY_URL),
    termsOfServiceUrl: httpsUrl(env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL),
    appVersion: appVersion(env.EXPO_PUBLIC_APP_VERSION),
  });
}

export async function openHelpLegalUrl(url: string): Promise<void> {
  const validUrl = httpsUrl(url);
  if (validUrl === null) throw new Error('invalid_help_legal_url');
  const { Linking } = await import('react-native');
  await Linking.openURL(validUrl);
}
