import { View, Text, Pressable, Modal, Platform, StyleSheet, Linking } from 'react-native';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react-native';
import { designFonts, useAppAppearance } from '@/theme';
import type { AppUpdateStatus } from '@meet-without-fear/shared';

interface UpdateBannerProps {
  onApply?: () => void;
  onDismiss?: () => void;
  updateStatus?: AppUpdateStatus;
  message?: string;
  downloadUrl?: string;
}

export function UpdateBanner({
  onApply,
  onDismiss,
  updateStatus = 'optional-update',
  message = 'A new version is ready. Tap to update now.',
  downloadUrl,
}: UpdateBannerProps) {
  const { palette } = useAppAppearance();
  const styles = makeStyles(palette);

  if (updateStatus === 'up-to-date') return null;

  const isRequired = updateStatus === 'required-update';
  const isOTA = !!onApply;
  const Icon = isRequired ? AlertTriangle : isOTA ? RefreshCw : Download;

  const handleUpdate = async () => {
    if (onApply) {
      await onApply();
      return;
    }
    if (!downloadUrl) return;
    try {
      const canOpen = await Linking.canOpenURL(downloadUrl);
      if (canOpen) {
        await Linking.openURL(downloadUrl);
      }
    } catch (error) {
      console.warn('[UpdateBanner] Failed to open download URL:', error);
    }
  };

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
          <View style={styles.iconWrap}>
            <Icon color={palette.accentText} size={22} />
          </View>
          <Text style={styles.title}>{isRequired ? 'Update Required' : 'Update Available'}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttons}>
            <Pressable onPress={handleUpdate} style={styles.updateButton}>
              <Text style={styles.updateButtonText}>Update Now</Text>
            </Pressable>

            {!isRequired && onDismiss && (
              <Pressable onPress={onDismiss} style={styles.laterButton}>
                <Text style={styles.laterButtonText}>Later</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: palette.scrim,
  },
  card: {
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoft,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: designFonts.sans,
  },
  message: {
    fontSize: 15,
    color: palette.textMuted,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: designFonts.sans,
  },
  buttons: {
    width: '100%',
    gap: 10,
  },
  updateButton: {
    backgroundColor: palette.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: palette.textOnAccent,
    fontFamily: designFonts.sans,
  },
  laterButton: {
    backgroundColor: palette.bgPane,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  laterButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: palette.textMuted,
    fontFamily: designFonts.sans,
  },
});
