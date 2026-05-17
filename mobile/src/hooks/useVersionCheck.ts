import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Application from 'expo-application';
import type { VersionCheckResponse } from '@meet-without-fear/shared';
import { get } from '@/src/lib/api';

export function useVersionCheck() {
  const appState = useRef(AppState.currentState);
  const isChecking = useRef(false);
  const [versionInfo, setVersionInfo] = useState<VersionCheckResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkVersion = useCallback(async () => {
    if (Platform.OS === 'web' || isChecking.current) return;

    const buildNumber = Number.parseInt(Application.nativeBuildVersion ?? '0', 10);
    if (!Number.isFinite(buildNumber) || buildNumber <= 0) return;

    isChecking.current = true;
    try {
      const platform = Platform.OS === 'android' ? 'android' : 'ios';
      const result = await get<VersionCheckResponse>(
        `/version/check?platform=${platform}&buildNumber=${buildNumber}`
      );
      setVersionInfo(result);
      if (result.updateStatus === 'up-to-date') {
        setDismissed(false);
      }
    } catch (error) {
      console.warn('[useVersionCheck] Failed to check native app version:', error);
    } finally {
      isChecking.current = false;
    }
  }, []);

  useEffect(() => {
    checkVersion();

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (appState.current.match(/background/) && nextState === 'active') {
          checkVersion();
        }
        appState.current = nextState;
      }
    );

    return () => subscription.remove();
  }, [checkVersion]);

  return {
    versionInfo,
    showVersionBanner:
      versionInfo !== null &&
      versionInfo.updateStatus !== 'up-to-date' &&
      !dismissed,
    dismissVersionBanner: () => setDismissed(true),
  };
}
