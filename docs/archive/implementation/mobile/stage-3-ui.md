# Stage 3 Need Mapping UI Implementation

## Source Documentation

- [Stage 3 Need Mapping](../../docs/mvp-planning/plans/stages/stage-3-need-mapping.md)

## Prerequisites

- [ ] `mobile/chat-interface.md` complete
- [ ] `backend/stage-3-api.md` complete

## External Services Required

> **None.**

## Scope

Implement the need mapping UI with needs display, common ground discovery, and confirmation flow.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/screens/__tests__/NeedMappingScreen.test.tsx`:

```typescript
describe('NeedMappingScreen', () => {
  it('shows identified needs', () => {
    render(<NeedMappingScreen sessionId="123" />);
    expect(screen.getByText(/your identified needs/i)).toBeTruthy();
  });

  it('shows common ground when found', () => {
    // Mock needs with overlap
    render(<NeedMappingScreen sessionId="123" />);
    expect(screen.getByText(/shared needs discovered/i)).toBeTruthy();
  });

  it('allows adjusting needs', () => {
    render(<NeedMappingScreen sessionId="123" />);
    expect(screen.getByText(/adjust these/i)).toBeTruthy();
  });

  it('confirms needs before advancing', () => {
    render(<NeedMappingScreen sessionId="123" />);
    fireEvent.press(screen.getByText(/this is right/i));
    // Verify confirmation flow
  });
});
```

### 2. Create need card component

Create `mobile/src/components/NeedCard.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  need: {
    category: string;
    description: string;
  };
  isShared?: boolean;
  onPress?: () => void;
}

export function NeedCard({ need, isShared, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, isShared && styles.sharedCard]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.category, isShared && styles.sharedCategory]}>
        {need.category}
      </Text>
      <Text style={styles.description}>{need.description}</Text>
      {isShared && (
        <View style={styles.sharedBadge}>
          <Text style={styles.sharedBadgeText}>Shared</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  sharedCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 4,
  },
  sharedCategory: {
    color: '#065F46',
  },
  description: {
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 22,
  },
  sharedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sharedBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
});
```

### 3. Create needs section component

Create `mobile/src/components/NeedsSection.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';
import { NeedCard } from './NeedCard';

interface Need {
  id: string;
  category: string;
  description: string;
}

interface Props {
  title: string;
  needs: Need[];
  sharedNeeds?: string[]; // IDs of shared needs
}

export function NeedsSection({ title, needs, sharedNeeds = [] }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {needs.map((need) => (
        <NeedCard
          key={need.id}
          need={need}
          isShared={sharedNeeds.includes(need.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
});
```

### 4. Create common ground card

Create `mobile/src/components/CommonGroundCard.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  sharedNeeds: { category: string; description: string }[];
  insight?: string;
}

export function CommonGroundCard({ sharedNeeds, insight }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Shared Needs Discovered</Text>

      {sharedNeeds.map((need, i) => (
        <View key={i} style={styles.needRow}>
          <Text style={styles.emoji}>🤝</Text>
          <View style={styles.needContent}>
            <Text style={styles.category}>{need.category}</Text>
            <Text style={styles.description}>{need.description}</Text>
          </View>
        </View>
      ))}

      {insight && (
        <View style={styles.insightBox}>
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 16,
  },
  needRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  emoji: {
    fontSize: 20,
    marginRight: 12,
  },
  needContent: {
    flex: 1,
  },
  category: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  description: {
    fontSize: 14,
    color: '#374151',
    marginTop: 2,
  },
  insightBox: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  insightText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#065F46',
    lineHeight: 20,
  },
});
```

### 5. Create need mapping screen

Create `mobile/app/(auth)/session/[id]/needs.tsx`:

```typescript
import { View, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '../../../../src/hooks/useSessions';
import { useMessages, useSendMessage } from '../../../../src/hooks/useMessages';
import { useNeedsMapping, useConfirmNeeds } from '../../../../src/hooks/useStage3';
import { ChatInterface } from '../../../../src/components/ChatInterface';
import { NeedsSection } from '../../../../src/components/NeedsSection';
import { CommonGroundCard } from '../../../../src/components/CommonGroundCard';
import { WaitingRoom } from '../../../../src/components/WaitingRoom';

export default function NeedMappingScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession(sessionId);
  const { data: mapping } = useNeedsMapping(sessionId);
  const { data: messages = [] } = useMessages(sessionId);
  const { mutate: sendMessage, isPending } = useSendMessage(sessionId);
  const { mutate: confirmNeeds } = useConfirmNeeds(sessionId);

  const phase = mapping?.phase || 'exploration';

  // Phase: Exploration - chat with AI about needs
  if (phase === 'exploration') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Understanding Your Needs</Text>
          <Text style={styles.subtitle}>
            The AI will help translate your feelings into underlying needs
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

  // Phase: Review - show identified needs
  if (phase === 'review') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Your Identified Needs</Text>
          <Text style={styles.subtitle}>
            Review and adjust if needed
          </Text>
        </View>

        <View style={styles.content}>
          <NeedsSection
            title="What you need most"
            needs={mapping?.myNeeds || []}
            sharedNeeds={mapping?.sharedNeedIds || []}
          />

          {mapping?.sharedNeeds?.length > 0 && (
            <CommonGroundCard
              sharedNeeds={mapping.sharedNeeds}
              insight={mapping.insight}
            />
          )}

          <View style={styles.confirmation}>
            <Text style={styles.confirmQuestion}>
              Does this capture what you need?
            </Text>
            <TouchableOpacity
              style={styles.adjustButton}
              onPress={() => sendMessage('I want to adjust my needs')}
            >
              <Text style={styles.adjustText}>I want to adjust</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => confirmNeeds({ confirmed: true })}
            >
              <Text style={styles.confirmText}>Yes, this is right</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  // Phase: Waiting for partner
  if (phase === 'waiting') {
    return (
      <View style={styles.container}>
        <WaitingRoom
          message="Waiting for your partner to confirm their needs"
          partnerName={session?.partner.name}
        />
      </View>
    );
  }

  // Phase: Complete - both confirmed
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
  content: { padding: 16 },
  confirmation: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  confirmQuestion: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  adjustButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  adjustText: {
    color: '#374151',
    fontSize: 14,
  },
  confirmButton: {
    padding: 14,
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

### 6. Create stage 3 hooks

Create `mobile/src/hooks/useStage3.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';

export function useNeedsMapping(sessionId: string) {
  const api = useApiClient();

  return useQuery({
    queryKey: ['needs-mapping', sessionId],
    queryFn: async () => {
      const { data } = await api.get(`/sessions/${sessionId}/stage-3/needs`);
      return data.data;
    },
    refetchInterval: 5000,
  });
}

export function useConfirmNeeds(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { confirmed: boolean; adjustments?: string }) => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-3/confirm`, params);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['needs-mapping', sessionId] });
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

- [ ] Exploration chat works with AI
- [ ] Identified needs display correctly
- [ ] Common ground card highlights shared needs
- [ ] Adjustment flow works
- [ ] Confirmation advances stage
- [ ] Soft, calming color scheme applied
- [ ] `npm run check` passes
- [ ] `npm run test` passes
