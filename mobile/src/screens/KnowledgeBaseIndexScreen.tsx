/**
 * Knowledge Base Index Screen (Placeholder)
 *
 * Minimal placeholder implementation so the Expo Router route compiles.
 * Full implementation arrives in Phase 18 Plan 02.
 *
 * Displays topics, people, and themes from the user's accumulated reflections.
 */

import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function KnowledgeBaseIndexScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>Knowledge Base</Text>
        <Text style={{ fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
          Full implementation coming in Plan 02
        </Text>
      </View>
    </SafeAreaView>
  );
}
