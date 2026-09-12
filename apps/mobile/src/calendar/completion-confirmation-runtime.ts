export type ForegroundCompletionConfirmationEvent = Readonly<{
  occurrenceId: string;
  awardedXp: number;
  totalXp: number;
}>;

type CompletionConfirmationListener = (event: ForegroundCompletionConfirmationEvent) => void;

export function createCompletionConfirmationChannel() {
  const listeners = new Set<CompletionConfirmationListener>();

  return Object.freeze({
    publish(event: ForegroundCompletionConfirmationEvent): void {
      for (const listener of [...listeners]) listener(event);
    },
    subscribe(listener: CompletionConfirmationListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export const completionConfirmationChannel = createCompletionConfirmationChannel();
