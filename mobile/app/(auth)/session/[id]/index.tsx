import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Component, ErrorInfo, ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { UnifiedSessionScreen } from '@/src/screens/UnifiedSessionScreen';
import { Stage } from '@meet-without-fear/shared';

class SessionScreenErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[SessionScreenErrorBoundary] Session screen crashed:', error);
    console.error('[SessionScreenErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>Session failed to open</Text>
        <Text style={{ fontSize: 14 }}>
          {this.state.error.message || 'Unknown session screen error'}
        </Text>
        <TouchableOpacity
          onPress={this.props.onBack}
          style={{ paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderRadius: 8 }}
        >
          <Text style={{ textAlign: 'center', fontWeight: '600' }}>Back to sessions</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

/**
 * Unified Session Screen
 *
 * Single chat-centric interface that handles all session stages.
 * No more separate screens per stage - everything flows through the chat.
 * Uses AI and Partner tabs to separate private coaching from shared content.
 */
export default function SessionScreen() {
  const { id, tendingEntryId, auditFixture, fromInnerThoughtsCreate } = useLocalSearchParams<{
    id: string;
    tendingEntryId?: string;
    auditFixture?: string;
    fromInnerThoughtsCreate?: string;
  }>();
  const router = useRouter();

  const handleNavigateBack = () => {
    if (fromInnerThoughtsCreate === '1') {
      router.replace('/(auth)/(tabs)');
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(auth)/(tabs)');
  };

  const handleStageComplete = (stage: Stage) => {
    // Optionally refresh or show a transition animation
    // The UnifiedSessionScreen handles stage progression internally
    console.log(`Stage ${stage} completed`);
  };

  if (!id) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // UnifiedSessionScreen has its own header
        }}
      />
      <SessionScreenErrorBoundary onBack={handleNavigateBack}>
        <UnifiedSessionScreen
          sessionId={id}
          initialTendingEntryId={typeof tendingEntryId === 'string' ? tendingEntryId : null}
          auditFixture={typeof auditFixture === 'string' ? auditFixture : null}
          onNavigateBack={handleNavigateBack}
          onStageComplete={handleStageComplete}
        />
      </SessionScreenErrorBoundary>
    </>
  );
}
