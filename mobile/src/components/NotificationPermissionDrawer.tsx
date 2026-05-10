import { useMemo } from 'react';
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

import { designFonts, useAppAppearance } from '@/src/theme';

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
  const { palette } = useAppAppearance();
  const styles = useStyles();

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
            <X size={22} color={palette.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.iconFrame}>
            <BellRing size={44} color={palette.accent} />
          </View>

          <Text style={styles.eyebrow}>Session timing</Text>
          <Text style={styles.title}>Know when it is your turn again</Text>
          <Text style={styles.body}>
            Sometimes this process includes waiting for the other person. A notification can let you know when it is your turn to engage again.
          </Text>

          <View style={styles.preview}>
            <View style={styles.previewIcon}>
              <Bell size={18} color={palette.accentText} />
            </View>
            <View style={styles.previewText}>
              <Text style={styles.previewTitle}>Your partner is ready</Text>
              <Text style={styles.previewBody}>Open the session when you are ready.</Text>
            </View>
            <Clock size={18} color={palette.textFaint} />
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
              <ActivityIndicator color={palette.bg} />
            ) : (
              <>
                <Bell size={18} color={palette.bg} />
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

const useStyles = () => {
  const { palette } = useAppAppearance();

  return useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.bg,
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
      backgroundColor: palette.chipBg,
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
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 28,
    },
    eyebrow: {
      color: palette.accentText,
      fontFamily: designFonts.mono,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    title: {
      color: palette.text,
      fontFamily: designFonts.serif,
      fontSize: 40,
      lineHeight: 43,
      fontWeight: '400',
      letterSpacing: -0.6,
      marginBottom: 16,
    },
    body: {
      color: palette.textMuted,
      fontSize: 17,
      lineHeight: 25,
      marginBottom: 28,
    },
    preview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: 10,
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
    },
    previewIcon: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: palette.accentSoft,
    },
    previewText: {
      flex: 1,
    },
    previewTitle: {
      color: palette.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 3,
    },
    previewBody: {
      color: palette.textMuted,
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
      borderRadius: 999,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    disabledButton: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: palette.bg,
      fontSize: 16,
      fontWeight: '800',
    },
    secondaryButton: {
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: palette.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
  }), [palette]);
};
