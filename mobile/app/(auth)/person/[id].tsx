/**
 * Person Detail Route
 *
 * Route handler for /person/[id] - displays person profile and session history.
 */

import { TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';

import { usePerson } from '../../../src/hooks/usePerson';
import { PersonDetailScreen } from '../../../src/screens/PersonDetailScreen';

// ============================================================================
// Route Component
// ============================================================================

export default function PersonDetailRoute() {
  const { id: personId } = useLocalSearchParams<{ id: string }>();
  const { data: person } = usePerson(personId);

  if (!personId) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: person?.name || 'Person',
          headerRight: () => (
            <TouchableOpacity
              accessibilityLabel="More options"
              accessibilityRole="button"
            >
              <MoreVertical color="#374151" size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <PersonDetailScreen personId={personId} />
    </>
  );
}
