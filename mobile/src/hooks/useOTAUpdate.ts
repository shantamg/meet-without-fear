import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import { track } from '@/src/services/mixpanel';

/**
 * Checks for OTA updates on mount and whenever the app returns from background.
 * If an update is available, downloads it silently then surfaces state so the
 * UI can prompt the user to reload.
 *
 * In dev client builds, expo-updates is disabled so this is a no-op.
 */
export function useOTAUpdate() {
  const appState = useRef(AppState.currentState);
  const isChecking = useRef(false);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__ || isChecking.current) return;
    isChecking.current = true;
    try {
      Sentry.addBreadcrumb({
        category: 'ota-update',
        message: 'Checking for OTA update',
        level: 'info',
        data: {
          channel: Updates.channel ?? 'unknown',
          runtimeVersion: Updates.runtimeVersion ?? 'unknown',
          updateId: Updates.updateId ?? 'none',
          isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        },
      });

      const update = await Updates.checkForUpdateAsync();

      track('OTA Update Checked', {
        channel: Updates.channel ?? 'unknown',
        runtime_version: Updates.runtimeVersion ?? 'unknown',
        current_update_id: Updates.updateId ?? 'none',
        is_available: update.isAvailable,
        is_embedded_launch: Updates.isEmbeddedLaunch,
      });

      if (update.isAvailable) {
        const fetchResult = await Updates.fetchUpdateAsync();

        Sentry.addBreadcrumb({
          category: 'ota-update',
          message: 'OTA update downloaded',
          level: 'info',
          data: {
            isNew: fetchResult.isNew,
            manifest: fetchResult.manifest?.id,
          },
        });

        track('OTA Update Downloaded', {
          channel: Updates.channel ?? 'unknown',
          runtime_version: Updates.runtimeVersion ?? 'unknown',
          new_manifest_id: fetchResult.manifest?.id ?? 'unknown',
          is_new: fetchResult.isNew,
        });

        setIsUpdateReady(true);
      }
    } catch (err) {
      console.warn('[OTA] Update check failed:', err);
      Sentry.captureException(err, {
        tags: { component: 'ota-update' },
        extra: {
          channel: Updates.channel ?? 'unknown',
          runtimeVersion: Updates.runtimeVersion ?? 'unknown',
          updateId: Updates.updateId ?? 'none',
          isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        },
      });
    } finally {
      isChecking.current = false;
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    Sentry.addBreadcrumb({
      category: 'ota-update',
      message: 'User tapped apply OTA update — reloading',
      level: 'info',
    });
    track('OTA Update Applied', {
      channel: Updates.channel ?? 'unknown',
      runtime_version: Updates.runtimeVersion ?? 'unknown',
      update_id: Updates.updateId ?? 'none',
    });
    await Updates.reloadAsync();
  }, []);

  useEffect(() => {
    if (__DEV__) return;

    // Check on mount (app launch)
    checkForUpdate();

    // Check when returning from background
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (appState.current.match(/background/) && nextState === 'active') {
          checkForUpdate();
        }
        appState.current = nextState;
      },
    );

    return () => subscription.remove();
  }, [checkForUpdate]);

  const dismissUpdate = useCallback(() => {
    Sentry.addBreadcrumb({
      category: 'ota-update',
      message: 'User dismissed OTA update banner',
      level: 'info',
    });
    track('OTA Update Dismissed', {
      channel: Updates.channel ?? 'unknown',
      runtime_version: Updates.runtimeVersion ?? 'unknown',
      update_id: Updates.updateId ?? 'none',
    });
    setDismissed(true);
  }, []);

  return {
    showUpdateBanner: isUpdateReady && !dismissed,
    applyUpdate,
    dismissUpdate,
  };
}
