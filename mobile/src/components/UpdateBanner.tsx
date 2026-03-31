import { View, Text, Pressable, Modal, Platform, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface UpdateBannerProps {
  onApply: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ onApply, onDismiss }: UpdateBannerProps) {
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 8,
              },
              android: { elevation: 8 },
            }),
          ]}
        >
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.message}>
            A new version is ready. Tap to update now.
          </Text>

          <View style={styles.buttons}>
            <Pressable onPress={onApply} style={styles.updateButton}>
              <Text style={styles.updateButtonText}>Update Now</Text>
            </Pressable>

            <Pressable onPress={onDismiss} style={styles.laterButton}>
              <Text style={styles.laterButtonText}>Later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  updateButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  laterButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  laterButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9ca3af',
  },
});
