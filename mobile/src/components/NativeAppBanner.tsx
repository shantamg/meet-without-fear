import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Download, X } from 'lucide-react-native';

import { colors, typography } from '../theme';
import { useNativeAppBannerDismissal } from '../hooks/useNativeAppBannerDismissal';

const APP_SCHEME_URL = 'meetwithoutfear://';
const DOWNLOAD_URL = 'https://meetwithoutfear.com/download';
// Mobile browsers background the tab quickly when a custom scheme resolves;
// 1500ms is long enough to notice that, short enough to feel responsive when
// the scheme doesn't resolve.
const SCHEME_PROBE_TIMEOUT_MS = 1500;

function openNativeAppOrDownload(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let settled = false;
  const fallback = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    window.location.href = DOWNLOAD_URL;
  }, SCHEME_PROBE_TIMEOUT_MS);

  const onHidden = () => {
    if (document.visibilityState === 'hidden') {
      settled = true;
      window.clearTimeout(fallback);
      cleanup();
    }
  };
  const onPageHide = () => {
    settled = true;
    window.clearTimeout(fallback);
    cleanup();
  };
  function cleanup() {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', onPageHide);
  }

  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', onPageHide);

  // Triggering the custom scheme as a same-window navigation is the broadest-
  // compatibility way to probe for an installed app on iOS/Android browsers.
  window.location.href = APP_SCHEME_URL;
}

export function NativeAppBanner() {
  const { dismissed, dismiss } = useNativeAppBannerDismissal();

  if (Platform.OS !== 'web' || dismissed) return null;

  return (
    <View style={styles.container}>
      <Download size={18} color={colors.accent} />
      <Text style={styles.label} numberOfLines={2}>
        Get the native app for a better experience
      </Text>
      <Pressable
        onPress={openNativeAppOrDownload}
        style={({ pressed }) => [styles.openButton, pressed && styles.openButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open in native app, or download it"
      >
        <Text style={styles.openButtonLabel}>Open in app</Text>
      </Pressable>
      <Pressable
        onPress={dismiss}
        style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
        accessibilityRole="button"
        accessibilityLabel="Dismiss banner"
        hitSlop={8}
      >
        <X size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  openButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  openButtonPressed: {
    backgroundColor: colors.accentHover,
  },
  openButtonLabel: {
    color: colors.textOnAccent,
    fontSize: typography.fontSize.base,
    fontWeight: '600',
  },
  dismiss: {
    padding: 4,
    borderRadius: 6,
  },
  dismissPressed: {
    backgroundColor: colors.bgTertiary,
  },
});
