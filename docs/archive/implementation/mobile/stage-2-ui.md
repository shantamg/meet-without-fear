# Stage 2 Perspective Stretch UI Implementation

## Source Documentation

- [Stage 2 Perspective Stretch](../../docs/mvp-planning/plans/stages/stage-2-perspective-stretch.md)
- [Consensual Bridge](../../docs/mvp-planning/plans/mechanisms/consensual-bridge.md)

## Prerequisites

- [ ] `mobile/chat-interface.md` complete
- [ ] `backend/stage-2-api.md` complete

## External Services Required

> **None.**

## Scope

Implement the perspective stretch UI with empathy building, consent-based sharing, and validation loop.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/screens/__tests__/PerspectiveStretchScreen.test.tsx`:

```typescript
describe('PerspectiveStretchScreen', () => {
  it('shows empathy building phase initially', () => {
    render(<PerspectiveStretchScreen sessionId="123" />);
    expect(screen.getByText(/building your understanding/i)).toBeTruthy();
  });

  it('shows consent prompt before sharing empathy attempt', () => {
    // Mock phase = ready_to_share
    render(<PerspectiveStretchScreen sessionId="123" phase="ready_to_share" />);
    expect(screen.getByText(/share your attempt/i)).toBeTruthy();
  });

  it('shows partner attempt in validation phase', () => {
    // Mock phase = validation, partnerAttempt available
    render(<PerspectiveStretchScreen sessionId="123" phase="validation" />);
    expect(screen.getByText(/partners understanding of you/i)).toBeTruthy();
  });

  it('allows accuracy feedback on partner attempt', () => {
    render(<PerspectiveStretchScreen sessionId="123" phase="validation" />);
    expect(screen.getByText(/how accurate is this/i)).toBeTruthy();
  });
});
```

### 2. Create empathy attempt card

Create `mobile/src/components/EmpathyAttemptCard.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  attempt: string;
  isPartner?: boolean;
}

export function EmpathyAttemptCard({ attempt, isPartner }: Props) {
  return (
    <View style={[styles.card, isPartner && styles.partnerCard]}>
      <Text style={styles.label}>
        {isPartner ? 'Partners attempt to understand you' : 'Your empathy attempt'}
      </Text>
      <Text style={styles.content}>{attempt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  partnerCard: {
    backgroundColor: '#EDE9FE',
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1F2937',
  },
});
```

### 3. Create consent prompt component

Create `mobile/src/components/ConsentPrompt.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  title: string;
  description: string;
  onConsent: () => void;
  onDecline: () => void;
  consentLabel?: string;
  declineLabel?: string;
}

export function ConsentPrompt({
  title,
  description,
  onConsent,
  onDecline,
  consentLabel = 'Yes, share this',
  declineLabel = 'Not yet',
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
          <Text style={styles.declineText}>{declineLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.consentButton} onPress={onConsent}>
          <Text style={styles.consentText}>{consentLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  declineText: {
    color: '#374151',
    fontSize: 14,
  },
  consentButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  consentText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
```

### 4. Create accuracy feedback component

Create `mobile/src/components/AccuracyFeedback.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onAccurate: () => void;
  onPartiallyAccurate: () => void;
  onInaccurate: () => void;
}

export function AccuracyFeedback({ onAccurate, onPartiallyAccurate, onInaccurate }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.question}>How accurate is this?</Text>

      <TouchableOpacity style={styles.accurateButton} onPress={onAccurate}>
        <Text style={styles.accurateText}>This feels accurate</Text>
        <Text style={styles.subtext}>I feel understood</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.partialButton} onPress={onPartiallyAccurate}>
        <Text style={styles.partialText}>Partially accurate</Text>
        <Text style={styles.subtext}>Some parts are right, some need adjustment</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.inaccurateButton} onPress={onInaccurate}>
        <Text style={styles.inaccurateText}>This misses the mark</Text>
        <Text style={styles.subtext}>I want to provide feedback</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginHorizontal: 16,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  accurateButton: {
    padding: 16,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    marginBottom: 8,
  },
  accurateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
  },
  partialButton: {
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    marginBottom: 8,
  },
  partialText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  inaccurateButton: {
    padding: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    marginBottom: 8,
  },
  inaccurateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
  },
  subtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});
```

### 5. Create perspective stretch screen

Create `mobile/app/(auth)/session/[id]/perspective.tsx`:

```typescript
import { View, StyleSheet, Text } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '../../../../src/hooks/useSessions';
import { useMessages, useSendMessage } from '../../../../src/hooks/useMessages';
import {
  useStage2Progress,
  useConsentToShare,
  useSubmitFeedback,
  useConfirmUnderstood,
} from '../../../../src/hooks/useStage2';
import { ChatInterface } from '../../../../src/components/ChatInterface';
import { EmpathyAttemptCard } from '../../../../src/components/EmpathyAttemptCard';
import { ConsentPrompt } from '../../../../src/components/ConsentPrompt';
import { AccuracyFeedback } from '../../../../src/components/AccuracyFeedback';
import { WaitingRoom } from '../../../../src/components/WaitingRoom';

export default function PerspectiveStretchScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession(sessionId);
  const { data: progress } = useStage2Progress(sessionId);
  const { data: messages = [] } = useMessages(sessionId);
  const { mutate: sendMessage, isPending } = useSendMessage(sessionId);
  const { mutate: consentToShare } = useConsentToShare(sessionId);
  const { mutate: submitFeedback } = useSubmitFeedback(sessionId);
  const { mutate: confirmUnderstood } = useConfirmUnderstood(sessionId);

  const phase = progress?.phase || 'building';

  // Phase: Building empathy
  if (phase === 'building') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Building Your Understanding</Text>
          <Text style={styles.subtitle}>
            Work with the AI to understand your partners perspective
          </Text>
        </View>
        <ChatInterface
          messages={messages}
          onSendMessage={sendMessage}
          isLoading={isPending}
        />
      </View>
    );
  }

  // Phase: Ready to share empathy attempt
  if (phase === 'ready_to_share') {
    return (
      <View style={styles.container}>
        <EmpathyAttemptCard attempt={progress?.myAttempt || ''} />
        <ConsentPrompt
          title="Share your attempt?"
          description="Your partner will see your attempt to understand their perspective. They can provide feedback."
          onConsent={() => consentToShare({ consent: true })}
          onDecline={() => consentToShare({ consent: false })}
        />
      </View>
    );
  }

  // Phase: Waiting for partner
  if (phase === 'waiting_for_partner') {
    return (
      <View style={styles.container}>
        <WaitingRoom
          message="Waiting for your partner to share their empathy attempt"
          partnerName={session?.partner.name}
        />
      </View>
    );
  }

  // Phase: Validation - reviewing partner's attempt
  if (phase === 'validation') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Partners Understanding of You</Text>
        </View>
        <EmpathyAttemptCard attempt={progress?.partnerAttempt || ''} isPartner />
        <AccuracyFeedback
          onAccurate={() => confirmUnderstood({ understood: true })}
          onPartiallyAccurate={() => submitFeedback({ accuracy: 'partial' })}
          onInaccurate={() => submitFeedback({ accuracy: 'inaccurate' })}
        />
      </View>
    );
  }

  // Phase: Complete
  if (phase === 'complete') {
    router.replace(`/session/${sessionId}`);
    return null;
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6B7280' },
});
```

### 6. Create stage 2 hooks

Create `mobile/src/hooks/useStage2.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';

export function useStage2Progress(sessionId: string) {
  const api = useApiClient();

  return useQuery({
    queryKey: ['stage2-progress', sessionId],
    queryFn: async () => {
      const { data } = await api.get(`/sessions/${sessionId}/stage-2/progress`);
      return data.data;
    },
    refetchInterval: 5000,
  });
}

export function useConsentToShare(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { consent: boolean }) => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-2/consent`, params);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage2-progress', sessionId] });
    },
  });
}

export function useSubmitFeedback(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { accuracy: 'accurate' | 'partial' | 'inaccurate'; feedback?: string }) => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-2/feedback`, params);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage2-progress', sessionId] });
    },
  });
}

export function useConfirmUnderstood(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { understood: boolean }) => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-2/understood`, params);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
}
```

### 7. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Empathy building chat works
- [ ] Consent prompt appears before sharing
- [ ] Partner attempt displays correctly
- [ ] Accuracy feedback buttons work
- [ ] Validation loop continues until understood
- [ ] Stage advances when both feel understood
- [ ] `npm run check` passes
- [ ] `npm run test` passes
