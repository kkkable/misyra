export type HelpLegalConfiguration = Readonly<{
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  appVersion: string;
}>;

export function resolveHelpLegalConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
): HelpLegalConfiguration {
  void env;
  return Object.freeze({
    privacyPolicyUrl: null,
    termsOfServiceUrl: null,
    appVersion: '0.0.0',
  });
}
