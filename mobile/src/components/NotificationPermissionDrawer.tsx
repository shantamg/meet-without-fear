import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Bell, BellRing, Clock, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/src/theme';

interface NotificationPermissionDrawerProps {
  visible: boolean;
  loading?: boolean;
  onEnable: () => void;
  onSkip: () => void;
}

export function NotificationPermissionDrawer({
  visible,
  loading = false,
  onEnable,
  onSkip,
}: NotificationPermissionDrawerProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onSkip}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.iconFrame}>
            <BellRing size={44} color={colors.brandOrange} />
          </View>

          <Text style={styles.eyebrow}>Session timing</Text>
          <Text style={styles.title}>Know when it is your turn again</Text>
          <Text style={styles.body}>
            Sometimes this process includes waiting for the other person. A notification can let you know when it is your turn to engage again.
          </Text>

          <View style={styles.preview}>
            <View style={styles.previewIcon}>
              <Bell size={18} color={colors.brandBlue} />
            </View>
            <View style={styles.previewText}>
              <Text style={styles.previewTitle}>Your partner is ready</Text>
              <Text style={styles.previewBody}>Open the session when you are ready.</Text>
            </View>
            <Clock size={18} color={colors.textMuted} />
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={onEnable}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <>
                <Bell size={18} color={colors.textOnAccent} />
                <Text style={styles.primaryButtonText}>Turn on notifications</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onSkip}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgSecondary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
  },
  eyebrow: {
    color: colors.brandBlue,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 16,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 28,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSecondary,
  },
  previewText: {
    flex: 1,
  },
  previewTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  previewBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  primaryButton: {
    height: 54,
    borderRadius: 8,
    backgroundColor: colors.brandOrange,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
