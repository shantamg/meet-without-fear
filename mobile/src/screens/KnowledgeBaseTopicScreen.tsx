/**
 * Knowledge Base Topic Screen (Placeholder)
 *
 * Minimal placeholder implementation so the Expo Router route compiles.
 * Full implementation arrives in Phase 18 Plan 02.
 *
 * Displays all takeaways for a specific topic, person, or theme.
 *
 * @param topic - The slug or ID for the topic/person/theme (from URL param)
 * @param type  - 'topic' | 'person' | 'theme' (from URL param)
 */

import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface KnowledgeBaseTopicScreenProps {
  topic?: string;
  type?: 'topic' | 'person' | 'theme';
}

export default function KnowledgeBaseTopicScreen({ topic, type }: KnowledgeBaseTopicScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>
          {topic ?? 'Topic'}
        </Text>
        {type ? (
          <Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            {type}
          </Text>
        ) : null}
        <Text style={{ fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
          Full implementation coming in Plan 02
        </Text>
      </View>
    </SafeAreaView>
  );
}
