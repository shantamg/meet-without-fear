/**
 * Knowledge Base Topic/Person/Theme Detail Route
 *
 * Expo Router dynamic route for topic, person, and theme detail screens.
 * Extracts `topic` and `type` from URL params and passes them to the screen.
 *
 * URL example: /inner-thoughts/knowledge-base/boundaries?type=topic
 *
 * Full screen implementation lives in KnowledgeBaseTopicScreen.tsx (Plan 02).
 */

import { useLocalSearchParams } from 'expo-router';
import KnowledgeBaseTopicScreen from '@/src/screens/KnowledgeBaseTopicScreen';

export default function KnowledgeBaseTopicRoute() {
  const { topic, type } = useLocalSearchParams<{
    topic: string;
    type?: 'topic' | 'person' | 'theme';
  }>();

  return <KnowledgeBaseTopicScreen topic={topic} type={type} />;
}
