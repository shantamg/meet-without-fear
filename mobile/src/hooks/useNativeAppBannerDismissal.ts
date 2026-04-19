import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'mwf.nativeAppBanner.dismissedAt';
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readDismissedAt(): number | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isStillDismissed(dismissedAt: number | null): boolean {
  if (dismissedAt === null) return false;
  return Date.now() - dismissedAt < DISMISSAL_TTL_MS;
}

export function useNativeAppBannerDismissal(): {
  dismissed: boolean;
  dismiss: () => void;
} {
  // Default to `true` so the banner stays hidden on native and during SSR.
  // Flip to the real value after mount on web.
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setDismissed(isStillDismissed(readDismissedAt()));
  }, []);

  const dismiss = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        // localStorage can throw in private-mode Safari; fall through and
        // dismiss in-memory so the current session at least respects the tap.
      }
    }
    setDismissed(true);
  }, []);

  return { dismissed, dismiss };
}
