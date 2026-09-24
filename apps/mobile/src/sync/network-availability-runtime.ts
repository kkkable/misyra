export type NetworkAvailability = 'available' | 'unavailable';
export type NetworkAvailabilityListener = (availability: NetworkAvailability) => void;

export function createNetworkAvailabilityChannel() {
  let current: NetworkAvailability | 'unknown' = 'unknown';
  const listeners = new Set<NetworkAvailabilityListener>();

  return Object.freeze({
    getCurrent(): NetworkAvailability | 'unknown' {
      return current;
    },
    publish(availability: NetworkAvailability): void {
      current = availability;
      for (const listener of [...listeners]) listener(availability);
    },
    subscribe(listener: NetworkAvailabilityListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export const networkAvailabilityChannel = createNetworkAvailabilityChannel();
