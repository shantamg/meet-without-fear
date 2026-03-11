# Stage 1 Witness UI Implementation

## Source Documentation

- [Stage 1 Witness](../../docs/mvp-planning/plans/stages/stage-1-witness.md)
- [Chat Interface Wireframe](../../docs/mvp-planning/plans/wireframes/chat-interface.md)

## Prerequisites

- [ ] `mobile/chat-interface.md` complete
- [ ] `mobile/emotional-barometer-ui.md` complete
- [ ] `backend/stage-1-api.md` complete

## External Services Required

> **None.**

## Scope

Implement the Stage 1 witness conversation UI where users share their perspective with the AI.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/screens/__tests__/WitnessScreen.test.tsx`:

```typescript
describe('WitnessScreen', () => {
  it('shows chat interface', () => {
    render(<WitnessScreen sessionId="123" />);
    expect(screen.getByTestId('chat-interface')).toBeTruthy();
  });

  it('shows feel heard confirmation after conversation', () => {
    // Mock messages with AI asking about feeling heard
    render(<WitnessScreen sessionId="123" />);
    expect(screen.getByText(/do you feel fully heard/i)).toBeTruthy();
  });

  it('shows emotional barometer periodically', () => {
    render(<WitnessScreen sessionId="123" />);
    expect(screen.getByTestId('emotional-barometer')).toBeTruthy();
  });

  it('advances to stage 2 when feel heard confirmed', async () => {
    const mockNavigate = jest.fn();
    render(<WitnessScreen sessionId="123" />);
    fireEvent.press(screen.getByText(/yes I feel heard/i));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('stage-2'));
  });
});
```

### 2. Create feel heard confirmation component

Create `mobile/src/components/FeelHeardConfirmation.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onConfirm: () => void;
  onContinue: () => void;
}

export function FeelHeardConfirmation({ onConfirm, onContinue }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.question}>Do you feel fully heard?</Text>
      <Text style={styles.subtitle}>
        Take your time - there is no rush to move forward
      </Text>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueText}>Not yet, I have more to share</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmText}>Yes, I feel heard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  buttons: {
    gap: 8,
  },
  continueButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
  },
  continueText: {
    color: '#374151',
    fontSize: 14,
  },
  confirmButton: {
    padding: 12,
    backgroundColor: '#10B981',
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
```

### 3. Create witness screen

Create `mobile/app/(auth)/session/[id]/witness.tsx`:

```typescript
import { View, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMessages, useSendMessage } from '../../../../src/hooks/useMessages';
import { useConfirmFeelHeard, useRecordBarometer } from '../../../../src/hooks/useStage1';
import { useSession } from '../../../../src/hooks/useSessions';
import { ChatInterface } from '../../../../src/components/ChatInterface';
import { EmotionalBarometer } from '../../../../src/components/EmotionalBarometer';
import { FeelHeardConfirmation } from '../../../../src/components/FeelHeardConfirmation';
import { WaitingRoom } from '../../../../src/components/WaitingRoom';

export default function WitnessScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession(sessionId);
  const { data: messages = [] } = useMessages(sessionId);
  const { mutate: sendMessage, isPending } = useSendMessage(sessionId);
  const { mutate: confirmHeard } = useConfirmFeelHeard(sessionId);
  const { mutate: recordBarometer } = useRecordBarometer(sessionId);

  const [showBarometer, setShowBarometer] = useState(false);
  const [barometerValue, setBarometerValue] = useState(5);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Check if AI has asked about feeling heard
  const lastAiMessage = [...messages].reverse().find(m => m.role === 'AI');
  const isAskingAboutHeard = lastAiMessage?.content.toLowerCase().includes('feel heard');

  const handleConfirmHeard = () => {
    confirmHeard(undefined, {
      onSuccess: () => {
        router.replace(`/session/${sessionId}`);
      },
    });
  };

  const handleBarometerChange = (value: number) => {
    setBarometerValue(value);
    recordBarometer({ intensity: value });
  };

  const myProgress = session?.myProgress;
  const partnerProgress = session?.partnerProgress;

  // If we completed stage 1 but partner hasn't
  if (myProgress?.stage === 'STAGE_2' && partnerProgress?.stage === 'STAGE_1') {
    return (
      <View style={styles.container}>
        <WaitingRoom
          message="Waiting for your partner to complete their witness session"
          partnerName={session?.partner.name}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChatInterface
        testID="chat-interface"
        messages={messages}
        onSendMessage={sendMessage}
        isLoading={isPending}
      />

      {showBarometer && (
        <EmotionalBarometer
          testID="emotional-barometer"
          value={barometerValue}
          onChange={handleBarometerChange}
        />
      )}

      {isAskingAboutHeard && (
        <FeelHeardConfirmation
          onConfirm={handleConfirmHeard}
          onContinue={() => setShowConfirmation(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
});
```

### 4. Create stage 1 hooks

Create `mobile/src/hooks/useStage1.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';

export function useConfirmFeelHeard(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-1/feel-heard`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
}

export function useRecordBarometer(sessionId: string) {
  const api = useApiClient();

  return useMutation({
    mutationFn: async (params: { intensity: number }) => {
      const { data } = await api.post(`/sessions/${sessionId}/barometer`, params);
      return data.data;
    },
  });
}
```

### 5. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Chat interface works for witness conversation
- [ ] AI responses display correctly
- [ ] Feel heard confirmation appears when AI asks
- [ ] Emotional barometer can be used
- [ ] Confirmation advances to next stage
- [ ] Waiting room shows when partner not ready
- [ ] `npm run check` passes
- [ ] `npm run test` passes
