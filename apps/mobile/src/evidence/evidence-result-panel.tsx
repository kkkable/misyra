import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { EvidenceResultFlow } from './evidence-result-flow.js';

export type EvidenceResultMessages = Readonly<{
  waiting: string;
  accepted: string;
  rejected: string;
  expired: string;
  tryAnotherPhoto: string;
  selfConfirm: string;
  selfConfirmPrompt: string;
  confirmSelfCompletion: string;
  cancel: string;
  reasonTaskMismatch: string;
  reasonTaskNotEvident: string;
  reasonImageUnusable: string;
}>;

export type EvidenceResultPanelProps = Readonly<{
  flow: EvidenceResultFlow;
  messages: EvidenceResultMessages;
  onRetry(): void | Promise<void>;
  onSelfConfirm(): void | Promise<void>;
}>;

export function EvidenceResultPanel(_props: EvidenceResultPanelProps): ReactNode {
  void _props;
  return <View testID="evidence-result-not-implemented" />;
}
