import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/src/theme';

interface PartnerInfoDrawerProps {
  visible: boolean;
  name: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
  stageDescription: string;
  topic?: string | null;
  onClose: () => void;
}

function formatTimeAgo(value?: string | null): string | null {
  if (!value) return null;

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const diffMs = Math.max(0, Date.now() - then);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;

  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
}

export function PartnerInfoDrawer({
  visible,
  name,
  isOnline,
  lastSeenAt,
  stageDescription,
  topic,
  onClose,
}: PartnerInfoDrawerProps) {
  const lastSeenText = formatTimeAgo(lastSeenAt);
  const statusText = isOnline ? 'Online now' : lastSeenText ? `Last seen ${lastSeenText}` : 'Not online right now';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropPressable}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close person details"
        />
        <SafeAreaView style={styles.drawer} edges={['bottom']}>
          <View style={styles.handle} />
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isOnline && styles.statusDotOnline]} />
            <Text style={[styles.statusText, isOnline && styles.statusTextOnline]}>{statusText}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.bodyText}>{stageDescription}</Text>
          </View>

          {topic ? (
            <View style={styles.topicBox}>
              <Text style={styles.topicLabel}>Conversation topic</Text>
              <Text style={styles.topicText}>{topic}</Text>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
  },
  backdropPressable: {
    flex: 1,
  },
  drawer: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgTertiary,
    marginTop: 10,
    marginBottom: 18,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.textMuted,
  },
  statusDotOnline: {
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  statusTextOnline: {
    color: colors.success,
  },
  section: {
    marginTop: 24,
  },
  bodyText: {
    color: colors.textPrimary,
    fontSize: 17,
    lineHeight: 25,
  },
  topicBox: {
    marginTop: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    padding: 16,
  },
  topicLabel: {
    color: colors.brandBlue,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 8,
  },
  topicText: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 23,
  },
});

export default PartnerInfoDrawer;
