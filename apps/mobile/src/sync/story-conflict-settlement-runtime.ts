export type StoryConflictSettlement = Readonly<{
  storyDraftId: string;
  occurrenceId: string;
}>;

export type StoryConflictSettlementListener = (settlement: StoryConflictSettlement) => void;

export function createStoryConflictSettlementChannel() {
  const listeners = new Set<StoryConflictSettlementListener>();

  return Object.freeze({
    publish(settlement: StoryConflictSettlement): void {
      for (const listener of [...listeners]) listener(settlement);
    },
    subscribe(listener: StoryConflictSettlementListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export const storyConflictSettlementChannel = createStoryConflictSettlementChannel();
