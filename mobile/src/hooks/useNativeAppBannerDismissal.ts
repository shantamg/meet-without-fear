import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export function useNativeAppBannerDismissal(): {
  dismissed: boolean;
  dismiss: () => void;
} {
  // Default to `true` so the banner stays hidden on native and during SSR.
  // Flip to the real value after mount on web.
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Show the banner on every fresh page load.
    setDismissed(false);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return { dismissed, dismiss };
}
