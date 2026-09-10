import { focusManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { AppTimeZoneNotice } from './app-time-zone-notice.js';
import { rootSyncRuntime } from './root-sync-runtime.js';

export type SyncRuntime = Readonly<{
  run(): Promise<unknown>;
}>;

type SyncRuntimeGateProps = PropsWithChildren<{
  runtime?: SyncRuntime;
}>;

type TimeZoneNotice = Readonly<{
  language: 'en' | 'zh-HK';
  timeZone: string;
}>;

const FOREGROUND_SYNC_INTERVAL_MS = 60_000;

const rootSyncQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
    },
  },
});

function timeZoneNoticeFromResult(value: unknown): TimeZoneNotice | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const notice = (value as { timeZoneNotice?: unknown }).timeZoneNotice;
  if (typeof notice !== 'object' || notice === null || Array.isArray(notice)) return null;
  const language = (notice as { language?: unknown }).language;
  const timeZone = (notice as { timeZone?: unknown }).timeZone;
  if ((language !== 'en' && language !== 'zh-HK') || typeof timeZone !== 'string') return null;
  return { language, timeZone };
}

function SyncRuntimeRunner({ children, runtime }: PropsWithChildren<{ runtime: SyncRuntime }>) {
  const nativeColorScheme = useColorScheme();
  const query = useQuery({
    queryKey: ['authenticated-sync-runtime'],
    queryFn: () => runtime.run(),
    networkMode: 'always',
    refetchInterval: FOREGROUND_SYNC_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const notice = timeZoneNoticeFromResult(query.data);
  void query;
  if (notice === null) return children;

  return (
    <>
      {children}
      <AppTimeZoneNotice
        colorScheme={nativeColorScheme === 'dark' ? 'dark' : 'light'}
        language={notice.language}
        timeZone={notice.timeZone}
      />
    </>
  );
}

export function SyncRuntimeGate({ children, runtime = rootSyncRuntime }: SyncRuntimeGateProps) {
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={rootSyncQueryClient}>
      <SyncRuntimeRunner runtime={runtime}>{children}</SyncRuntimeRunner>
    </QueryClientProvider>
  );
}
