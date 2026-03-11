# Stage 4 Strategic Repair UI Implementation

## Source Documentation

- [Stage 4 Strategic Repair](../../docs/mvp-planning/plans/stages/stage-4-strategic-repair.md)

## Prerequisites

- [ ] `mobile/chat-interface.md` complete
- [ ] `backend/stage-4-api.md` complete

## External Services Required

> **None.**

## Scope

Implement strategic repair UI with unlabeled strategy pool, private ranking, overlap reveal, and agreement documentation.

## Implementation Steps

### 1. Write tests first

Create `mobile/src/screens/__tests__/StrategicRepairScreen.test.tsx`:

```typescript
describe('StrategicRepairScreen', () => {
  it('shows strategy pool without attribution', () => {
    render(<StrategicRepairScreen sessionId="123" />);
    // Verify strategies shown without "You suggested" or "Partner suggested"
    expect(screen.queryByText(/you suggested/i)).toBeNull();
    expect(screen.queryByText(/partner suggested/i)).toBeNull();
  });

  it('allows requesting more AI suggestions', () => {
    render(<StrategicRepairScreen sessionId="123" />);
    expect(screen.getByText(/generate more ideas/i)).toBeTruthy();
  });

  it('shows private ranking interface', () => {
    render(<StrategicRepairScreen sessionId="123" phase="ranking" />);
    expect(screen.getByText(/select your top choices/i)).toBeTruthy();
  });

  it('reveals overlap after both rank', () => {
    render(<StrategicRepairScreen sessionId="123" phase="reveal" />);
    expect(screen.getByText(/you both chose/i)).toBeTruthy();
  });
});
```

### 2. Create strategy card component

Create `mobile/src/components/StrategyCard.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, Circle } from 'lucide-react-native';

interface Props {
  strategy: {
    id: string;
    description: string;
    duration?: string;
  };
  selected?: boolean;
  rank?: number;
  onSelect?: () => void;
  isOverlap?: boolean;
}

export function StrategyCard({ strategy, selected, rank, onSelect, isOverlap }: Props) {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        selected && styles.selectedCard,
        isOverlap && styles.overlapCard,
      ]}
      onPress={onSelect}
      disabled={!onSelect}
    >
      {onSelect && (
        <View style={styles.checkbox}>
          {selected ? (
            <View style={styles.selectedIndicator}>
              <Text style={styles.rankNumber}>{rank}</Text>
            </View>
          ) : (
            <Circle color="#9CA3AF" size={24} />
          )}
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.description}>{strategy.description}</Text>
        {strategy.duration && (
          <Text style={styles.duration}>{strategy.duration}</Text>
        )}
      </View>

      {isOverlap && (
        <View style={styles.overlapBadge}>
          <Check color="white" size={16} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCard: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  overlapCard: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  checkbox: {
    marginRight: 12,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  description: {
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 22,
  },
  duration: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  overlapBadge: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 4,
  },
});
```

### 3. Create strategy pool component

Create `mobile/src/components/StrategyPool.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StrategyCard } from './StrategyCard';

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

interface Props {
  strategies: Strategy[];
  onRequestMore: () => void;
  onReady: () => void;
  isGenerating?: boolean;
}

export function StrategyPool({ strategies, onRequestMore, onReady, isGenerating }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Here is what we have come up with</Text>
        <Text style={styles.subtitle}>
          Strategies are shown without attribution - focus on the ideas
        </Text>
      </View>

      <ScrollView style={styles.list}>
        {strategies.map((strategy) => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={onRequestMore}
          disabled={isGenerating}
        >
          <Text style={styles.moreText}>
            {isGenerating ? 'Generating...' : 'Generate more ideas'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.readyButton} onPress={onReady}>
          <Text style={styles.readyText}>These look good - rank my choices</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6B7280' },
  list: { flex: 1, padding: 16 },
  actions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  moreButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  moreText: { color: '#4F46E5', fontSize: 14 },
  readyButton: {
    padding: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  readyText: { color: 'white', fontSize: 14, fontWeight: '600' },
});
```

### 4. Create ranking interface

Create `mobile/src/components/StrategyRanking.tsx`:

```typescript
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useState } from 'react';
import { StrategyCard } from './StrategyCard';

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

interface Props {
  strategies: Strategy[];
  onSubmit: (rankings: string[]) => void;
}

export function StrategyRanking({ strategies, onSubmit }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((s) => s !== id));
    } else if (selectedIds.length < 3) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const getRank = (id: string) => {
    const index = selectedIds.indexOf(id);
    return index >= 0 ? index + 1 : undefined;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rank Your Top Choices</Text>
        <Text style={styles.subtitle}>
          Select up to 3 options - your partner will not see your picks until you both submit
        </Text>
      </View>

      <ScrollView style={styles.list}>
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            selected={selectedIds.includes(strategy.id)}
            rank={getRank(strategy.id)}
            onSelect={() => toggleSelection(strategy.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.count}>{selectedIds.length}/3 selected</Text>
        <TouchableOpacity
          style={[styles.submitButton, selectedIds.length === 0 && styles.submitDisabled]}
          onPress={() => onSubmit(selectedIds)}
          disabled={selectedIds.length === 0}
        >
          <Text style={styles.submitText}>Submit my ranking</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 16,
    backgroundColor: '#FEF3C7',
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#92400E' },
  list: { flex: 1, padding: 16 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  count: {
    textAlign: 'center',
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  submitButton: {
    padding: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitText: { color: 'white', fontSize: 14, fontWeight: '600' },
});
```

### 5. Create overlap reveal component

Create `mobile/src/components/OverlapReveal.tsx`:

```typescript
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StrategyCard } from './StrategyCard';

interface Strategy {
  id: string;
  description: string;
  duration?: string;
}

interface Props {
  overlapping: Strategy[];
  uniqueToMe: Strategy[];
  uniqueToPartner: Strategy[];
}

export function OverlapReveal({ overlapping, uniqueToMe, uniqueToPartner }: Props) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Shared Priorities</Text>
        <Text style={styles.subtitle}>Common ground found!</Text>
      </View>

      {overlapping.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>You Both Chose</Text>
          {overlapping.map((s) => (
            <StrategyCard key={s.id} strategy={s} isOverlap />
          ))}
        </View>
      )}

      {(uniqueToMe.length > 0 || uniqueToPartner.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Only One of You Chose</Text>
          {[...uniqueToMe, ...uniqueToPartner].map((s) => (
            <StrategyCard key={s.id} strategy={s} />
          ))}
        </View>
      )}

      {overlapping.length === 0 && (
        <View style={styles.noOverlap}>
          <Text style={styles.noOverlapText}>
            No direct overlap yet - but that is okay! Let us explore your different preferences.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '600', color: '#065F46' },
  subtitle: { fontSize: 14, color: '#10B981', marginTop: 4 },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#374151',
  },
  noOverlap: {
    padding: 24,
    alignItems: 'center',
  },
  noOverlapText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
```

### 6. Create strategic repair screen

Create `mobile/app/(auth)/session/[id]/repair.tsx`:

```typescript
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '../../../../src/hooks/useSessions';
import {
  useStrategies,
  useSubmitRanking,
  useRequestMoreStrategies,
  useConfirmAgreement,
} from '../../../../src/hooks/useStage4';
import { StrategyPool } from '../../../../src/components/StrategyPool';
import { StrategyRanking } from '../../../../src/components/StrategyRanking';
import { OverlapReveal } from '../../../../src/components/OverlapReveal';
import { AgreementCard } from '../../../../src/components/AgreementCard';
import { WaitingRoom } from '../../../../src/components/WaitingRoom';

export default function StrategicRepairScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession(sessionId);
  const { data: strategyData } = useStrategies(sessionId);
  const { mutate: submitRanking } = useSubmitRanking(sessionId);
  const { mutate: requestMore, isPending: isGenerating } = useRequestMoreStrategies(sessionId);
  const { mutate: confirmAgreement } = useConfirmAgreement(sessionId);

  const phase = strategyData?.phase || 'pool';

  // Phase: View strategy pool
  if (phase === 'pool') {
    return (
      <View style={styles.container}>
        <StrategyPool
          strategies={strategyData?.strategies || []}
          onRequestMore={() => requestMore()}
          onReady={() => submitRanking({ ready: true })}
          isGenerating={isGenerating}
        />
      </View>
    );
  }

  // Phase: Private ranking
  if (phase === 'ranking') {
    return (
      <View style={styles.container}>
        <StrategyRanking
          strategies={strategyData?.strategies || []}
          onSubmit={(rankings) => submitRanking({ rankings })}
        />
      </View>
    );
  }

  // Phase: Waiting for partner to rank
  if (phase === 'waiting') {
    return (
      <View style={styles.container}>
        <WaitingRoom
          message="Waiting for your partner to submit their ranking"
          partnerName={session?.partner.name}
        />
      </View>
    );
  }

  // Phase: Reveal overlap
  if (phase === 'reveal') {
    return (
      <View style={styles.container}>
        <OverlapReveal
          overlapping={strategyData?.overlapping || []}
          uniqueToMe={strategyData?.uniqueToMe || []}
          uniqueToPartner={strategyData?.uniqueToPartner || []}
        />
      </View>
    );
  }

  // Phase: Agreement
  if (phase === 'agreement') {
    return (
      <View style={styles.container}>
        <AgreementCard
          agreement={strategyData?.agreement}
          onConfirm={() => confirmAgreement({ confirmed: true })}
        />
      </View>
    );
  }

  // Phase: Complete
  if (phase === 'complete') {
    router.replace(`/session/${sessionId}/complete`);
    return null;
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
});
```

### 7. Create agreement card

Create `mobile/src/components/AgreementCard.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Agreement {
  experiment: string;
  duration: string;
  successMeasure: string;
  checkInDate?: string;
}

interface Props {
  agreement: Agreement;
  onConfirm: () => void;
}

export function AgreementCard({ agreement, onConfirm }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Micro-Experiment Agreement</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Experiment</Text>
        <Text style={styles.value}>{agreement.experiment}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>{agreement.duration}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Success Measure</Text>
        <Text style={styles.value}>{agreement.successMeasure}</Text>
      </View>

      {agreement.checkInDate && (
        <View style={styles.field}>
          <Text style={styles.label}>Check-in Scheduled</Text>
          <Text style={styles.value}>{agreement.checkInDate}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
        <Text style={styles.confirmText}>Confirm Agreement</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 20,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 20,
    textAlign: 'center',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#1F2937',
  },
  confirmButton: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#10B981',
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

### 8. Create stage 4 hooks

Create `mobile/src/hooks/useStage4.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';

export function useStrategies(sessionId: string) {
  const api = useApiClient();

  return useQuery({
    queryKey: ['strategies', sessionId],
    queryFn: async () => {
      const { data } = await api.get(`/sessions/${sessionId}/stage-4/strategies`);
      return data.data;
    },
    refetchInterval: 5000,
  });
}

export function useRequestMoreStrategies(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-4/generate`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies', sessionId] });
    },
  });
}

export function useSubmitRanking(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { ready?: boolean; rankings?: string[] }) => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-4/rank`, params);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies', sessionId] });
    },
  });
}

export function useConfirmAgreement(sessionId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { confirmed: boolean }) => {
      const { data } = await api.post(`/sessions/${sessionId}/stage-4/confirm`, params);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
}
```

### 9. Run verification

```bash
npm run check
npm run test
npx expo start
```

## Verification

- [ ] Strategy pool shows options without attribution
- [ ] Generate more ideas works
- [ ] Private ranking allows selecting 1-3 options
- [ ] Rankings stay private until both submit
- [ ] Overlap reveal shows shared choices
- [ ] No-overlap path works gracefully
- [ ] Agreement card shows final experiment
- [ ] Confirmation completes the session
- [ ] `npm run check` passes
- [ ] `npm run test` passes
