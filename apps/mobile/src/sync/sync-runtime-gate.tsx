import { focusManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { rootSyncRuntime } from './root-sync-runtime.js';

export type SyncRuntime = Readonly<{
  run(): Promise<unknown>;
}>;

type SyncRuntimeGateProps = PropsWithChildren<{
  runtime?: SyncRuntime;
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

function SyncRuntimeRunner({ children, runtime }: PropsWithChildren<{ runtime: SyncRuntime }>) {
  const query = useQuery({
    queryKey: ['authenticated-sync-runtime'],
    queryFn: () => runtime.run(),
    networkMode: 'always',
    refetchInterval: FOREGROUND_SYNC_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  void query;
  return children;
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
