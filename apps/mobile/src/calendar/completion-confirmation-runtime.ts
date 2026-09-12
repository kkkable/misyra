export type ForegroundCompletionConfirmationEvent = Readonly<{
  occurrenceId: string;
  awardedXp: number;
  totalXp: number;
}>;

export type ForegroundCompletionRequest = Readonly<{
  occurrenceId: string;
}>;

type CompletionConfirmationListener = (event: ForegroundCompletionConfirmationEvent) => void;
type CompletionRequestListener = (request: ForegroundCompletionRequest) => void;

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

export function createCompletionConfirmationRequestChannel() {
  const listeners = new Set<CompletionRequestListener>();

  return Object.freeze({
    publish(request: ForegroundCompletionRequest): void {
      for (const listener of [...listeners]) listener(request);
    },
    subscribe(listener: CompletionRequestListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export const completionConfirmationChannel = createCompletionConfirmationChannel();
export const completionConfirmationRequestChannel = createCompletionConfirmationRequestChannel();