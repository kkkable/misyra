import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { ObservableLocalQuery } from './local-repositories.js';

export function useObservableLocalQuery<T>(query: ObservableLocalQuery<T>): T | undefined {
  const subscribe = useCallback((listener: () => void) => query.subscribe(listener), [query]);
  const getSnapshot = useCallback(() => query.getSnapshot(), [query]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void query.refresh();
  }, [query]);

  return snapshot;
}
