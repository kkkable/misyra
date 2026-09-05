import { Text, View } from 'react-native';

import { space, typography } from '@misyra/design-tokens';

import { PrimaryButton, Screen, SecondaryButton, themeColors } from '../design-system/index.js';
import type { AuthProvider } from './auth-session.js';

export type SignInMessages = {
  readonly title: string;
  readonly apple: string;
  readonly google: string;
};

type SignInScreenProps = {
  readonly colorScheme: 'light' | 'dark';
  readonly messages: SignInMessages;
  readonly errorMessage?: string;
  readonly busyProvider?: AuthProvider;
  readonly onSignIn: (provider: AuthProvider) => void;
};

export function SignInScreen({
  colorScheme,
  messages,
  errorMessage,
  busyProvider,
  onSignIn,
}: SignInScreenProps) {
  const colors = themeColors(colorScheme);

  return (
    <Screen
      accessibilityLabel={messages.title}
      colorScheme={colorScheme}
      testID="auth-sign-in-screen"
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: space[4] }}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.textPrimary,
            fontSize: typography.title2.fontSize,
            fontWeight: '700',
          }}
        >
          {messages.title}
        </Text>
        <PrimaryButton
          accessibilityLabel={messages.apple}
          colorScheme={colorScheme}
          label={messages.apple}
          loading={busyProvider === 'apple'}
          onPress={() => {
            onSignIn('apple');
          }}
          testID="auth-sign-in-apple"
        />
        <SecondaryButton
          accessibilityLabel={messages.google}
          colorScheme={colorScheme}
          label={messages.google}
          loading={busyProvider === 'google'}
          onPress={() => {
            onSignIn('google');
          }}
          testID="auth-sign-in-google"
        />
        {errorMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            allowFontScaling
            style={{ color: colors.textPrimary, fontSize: typography.body.fontSize }}
          >
            {errorMessage}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
