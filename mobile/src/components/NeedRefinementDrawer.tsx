import { useMemo } from 'react';
import {
  MessageRole,
  Stage,
} from '@meet-without-fear/shared';
import type { IdentifiedNeedDTO, NeedEditPlan } from '@meet-without-fear/shared';
import { GuidedDraftChatModal, GuidedDraftMessage } from './GuidedDraftChatModal';

export interface NeedRefinementChatMessage extends GuidedDraftMessage {
  plan?: NeedEditPlan | null;
}

interface NeedRefinementDrawerProps {
  visible: boolean;
  need: IdentifiedNeedDTO | null;
  sessionId: string;
  messages: NeedRefinementChatMessage[];
  isSending?: boolean;
  isApplying?: boolean;
  onSendMessage: (content: string) => void;
  onApplyPlan: (plan: NeedEditPlan) => void;
  onClose: () => void;
  testID?: string;
}

function proposedTextForPlan(plan?: NeedEditPlan | null): string | null {
  if (!plan) return null;
  const changed = plan.affectedNeeds.find((item) => item.after?.text);
  if (changed?.after?.text) return changed.after.text;

  const update = plan.operations.find((operation) => operation.type === 'updateNeedText' && operation.newText);
  if (update?.newText) return update.newText;

  const add = plan.operations.find((operation) => operation.type === 'addNeed' && operation.text);
  return add?.text ?? null;
}

function timestampBeforeThread(messages: NeedRefinementChatMessage[], fallback?: string): string {
  const firstMessageTime = messages.reduce<number | null>((earliest, message) => {
    const time = new Date(message.timestamp).getTime();
    if (!Number.isFinite(time)) return earliest;
    return earliest === null ? time : Math.min(earliest, time);
  }, null);

  if (firstMessageTime !== null) {
    return new Date(firstMessageTime - 1).toISOString();
  }

  return fallback ?? new Date().toISOString();
}

export function NeedRefinementDrawer({
  visible,
  need,
  sessionId,
  messages,
  isSending = false,
  isApplying = false,
  onSendMessage,
  onApplyPlan,
  onClose,
  testID = 'need-refinement-drawer',
}: NeedRefinementDrawerProps) {
  const sessionKey = need ? `need-refinement-${sessionId}-${need.id}` : 'need-refinement';

  const messagesWithCandidates = useMemo(
    () => {
      const displayedMessages = messages.map((message) => ({
        ...message,
        proposedContent: message.proposedContent ?? proposedTextForPlan(message.plan),
      }));

      if (!need) return displayedMessages;

      return [
        createNeedRefinementMessage({
          id: `need-refine-initial-${need.id}`,
          sessionId,
          role: MessageRole.AI,
          content: `Here's the current version. You can use it as-is, or tell me what you'd like to make clearer.`,
          proposedContent: need.need,
          timestamp: timestampBeforeThread(displayedMessages, need.createdAt),
        }),
        ...displayedMessages,
      ];
    },
    [messages, need, sessionId],
  );

  const planByText = useMemo(() => {
    const map = new Map<string, NeedEditPlan>();
    for (const message of messagesWithCandidates) {
      if (message.proposedContent && message.plan) {
        map.set(message.proposedContent, message.plan);
      }
    }
    return map;
  }, [messagesWithCandidates]);

  const handleFinalize = (content: string) => {
    if (need && content === need.need) {
      onClose();
      return;
    }

    const plan = planByText.get(content);
    if (plan) onApplyPlan(plan);
  };

  return (
    <GuidedDraftChatModal
      visible={visible}
      title="Refine this need"
      sessionKey={sessionKey}
      messages={messagesWithCandidates}
      isLoading={isSending}
      isFinalizing={isApplying}
      partnerName=""
      proposalTitle="Need"
      proposalSubtitle="Use this version, or keep chatting to refine it more."
      finalActionLabel="Use this version"
      finalActionLatestOnly
      onSendMessage={onSendMessage}
      onFinalize={handleFinalize}
      onClose={onClose}
      emptyStateTitle=""
      emptyStateMessage=""
      finalButtonTestID={`${testID}-use-version`}
      testID={testID}
    />
  );
}

export function createNeedRefinementMessage({
  id,
  sessionId,
  role,
  content,
  plan,
  proposedContent,
  timestamp,
}: {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  plan?: NeedEditPlan | null;
  proposedContent?: string | null;
  timestamp?: string;
}): NeedRefinementChatMessage {
  return {
    id,
    sessionId,
    senderId: role === MessageRole.USER ? 'current-user' : null,
    role,
    content,
    stage: Stage.NEED_MAPPING,
    timestamp: timestamp ?? new Date().toISOString(),
    plan,
    proposedContent,
  };
}

export default NeedRefinementDrawer;
