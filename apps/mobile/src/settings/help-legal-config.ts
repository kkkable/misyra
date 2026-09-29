export type HelpLegalConfiguration = Readonly<{
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
}>;

export type HelpLegalConfigurationInput = Readonly<{
  privacyPolicyUrl?: string | undefined;
  termsOfServiceUrl?: string | undefined;
}>;

function httpsUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (candidate.length === 0) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

export function resolveHelpLegalConfiguration(
  input: HelpLegalConfigurationInput,
): HelpLegalConfiguration {
  return Object.freeze({
    privacyPolicyUrl: httpsUrl(input.privacyPolicyUrl),
    termsOfServiceUrl: httpsUrl(input.termsOfServiceUrl),
  });
}

export async function openHelpLegalUrl(url: string): Promise<void> {
  const validUrl = httpsUrl(url);
  if (validUrl === null) throw new Error('invalid_help_legal_url');
  const { Linking } = await import('react-native');
  await Linking.openURL(validUrl);
}
