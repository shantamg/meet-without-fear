/**
 * InvitationShareButton Component
 *
 * A compact share button that appears above the chat input when
 * the user is ready to share an invitation. Triggers the OS share
 * sheet with a hardcoded canonical body + the invitation URL.
 */

import { View, Text, TouchableOpacity, Share, StyleSheet, Platform } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { colors } from '../theme';
import { buildInvitationShareText } from '../utils/invitationShareText';

interface InvitationShareButtonProps {
  /** The invitation URL to share */
  invitationUrl: string;
  /** Partner's name for the share dialog title */
  partnerName?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Callback when share is successful */
  onShareSuccess?: () => void;
  /** Test ID for testing */
  testID?: string;
}

export function InvitationShareButton({
  invitationUrl,
  partnerName,
  disabled = false,
  onShareSuccess,
  testID,
}: InvitationShareButtonProps) {
  const handleShare = async () => {
    if (disabled) return;

    try {
      const shareMessage = buildInvitationShareText(invitationUrl);

      // On web, navigator.share usually drops `text` when `url` is set
      // (Chrome) or concatenates them awkwardly. To get the full message +
      // link in the shared payload everywhere, fold everything into `message`
      // and skip `url` on web. Native platforms keep both fields populated so
      // the OS share sheet can render them properly.
      const result = await Share.share(
        Platform.OS === 'web'
          ? {
              message: shareMessage,
              title: partnerName ? `Invitation for ${partnerName}` : 'Join me on Meet Without Fear',
            }
          : {
              message: shareMessage,
              title: partnerName ? `Invitation for ${partnerName}` : 'Join me on Meet Without Fear',
              url: invitationUrl,
            }
      );

      if (result.action === Share.sharedAction) {
        onShareSuccess?.();
      }
    } catch (error) {
      console.error('[InvitationShareButton] Share error:', error);
    }
  };

  const buttonText = partnerName ? `Invite ${partnerName}` : 'Share Invitation';

  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.containerDisabled]}
      onPress={handleShare}
      disabled={disabled}
      activeOpacity={0.8}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={buttonText}
      accessibilityHint="Opens share sheet to send invitation"
    >
      <View style={styles.content}>
        <Share2 color="#FFFFFF" size={18} />
        <Text style={styles.buttonText}>{buttonText}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.accent,
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  containerDisabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
