import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { rootSyncRuntime } from './root-sync-runtime.js';

export type SyncRuntime = Readonly<{
  run(): Promise<unknown>;
}>;

type SyncRuntimeGateProps = PropsWithChildren<{
  runtime?: SyncRuntime;
}>;

const rootSyncQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnReconnect: true,
      staleTime: 0,
    },
  },
});

function SyncRuntimeRunner({ children, runtime }: PropsWithChildren<{ runtime: SyncRuntime }>) {
  const query = useQuery({
    queryKey: ['authenticated-sync-runtime'],
    queryFn: () => runtime.run(),
    refetchOnMount: 'always',
  });
  void query;
  return children;
}

export function SyncRuntimeGate({ children, runtime = rootSyncRuntime }: SyncRuntimeGateProps) {
  return (
    <QueryClientProvider client={rootSyncQueryClient}>
      <SyncRuntimeRunner runtime={runtime}>{children}</SyncRuntimeRunner>
    </QueryClientProvider>
  );
}
