/**
 * Person Detail Route
 *
 * Route handler for /person/[id] - displays person profile and session history.
 */

import { useState, useCallback } from 'react';
import { TouchableOpacity, Modal, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { MoreVertical, History, UserMinus, X } from 'lucide-react-native';

import { usePerson } from '../../../src/hooks/usePerson';
import { PersonDetailScreen } from '../../../src/screens/PersonDetailScreen';
import { colors } from '@/theme';

// ============================================================================
// Route Component
// ============================================================================

export default function PersonDetailRoute() {
  const { id: personId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: person } = usePerson(personId);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const handleOpenMenu = useCallback(() => {
    setIsMenuVisible(true);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setIsMenuVisible(false);
  }, []);

  const handleViewFullHistory = useCallback(() => {
    setIsMenuVisible(false);
    // Navigate to full history view
    router.push(`/person/${personId}/history`);
  }, [personId, router]);

  const handleRemovePerson = useCallback(() => {
    setIsMenuVisible(false);
    // Show confirmation dialog
    Alert.alert(
      'Remove Person',
      `Are you sure you want to remove ${person?.name || 'this person'} from your contacts? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement actual removal API call
            // For now, navigate back after simulated removal
            router.back();
          },
        },
      ]
    );
  }, [person?.name, router]);

  if (!personId) {
    return null;
  }

  // Can only remove person if there's no active session
  const canRemove = !person?.activeSession;

  return (
    <>
      <Stack.Screen
        options={{
          title: person?.name || 'Person',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleOpenMenu}
              accessibilityLabel="More options"
              accessibilityRole="button"
              testID="person-options-button"
            >
              <MoreVertical color={colors.textPrimary} size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <PersonDetailScreen personId={personId} />

      {/* Options Menu Modal */}
      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseMenu}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCloseMenu}>
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Options</Text>
              <TouchableOpacity
                onPress={handleCloseMenu}
                accessibilityLabel="Close menu"
                accessibilityRole="button"
              >
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleViewFullHistory}
              accessibilityRole="button"
              testID="view-history-option"
            >
              <History color={colors.textPrimary} size={20} />
              <Text style={styles.menuItemText}>View Full History</Text>
            </TouchableOpacity>

            {canRemove && (
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDestructive]}
                onPress={handleRemovePerson}
                accessibilityRole="button"
                testID="remove-person-option"
              >
                <UserMinus color={colors.error} size={20} />
                <Text style={[styles.menuItemText, styles.menuItemTextDestructive]}>
                  Remove Person
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32, // Safe area padding
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemDestructive: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.textPrimary,
    marginLeft: 12,
  },
  menuItemTextDestructive: {
    color: colors.error,
  },
});
