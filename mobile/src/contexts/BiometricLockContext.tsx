import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth as useClerkAuth } from '@clerk/clerk-expo';

import { useBiometricAuth } from '@/src/hooks/useBiometricAuth';

interface BiometricLockContextValue {
  isLocked: boolean;
  biometricName: string;
  shouldAutoTrigger: boolean;
  setShouldAutoTrigger: (value: boolean) => void;
  unlock: () => Promise<{ success: boolean; error?: string }>;
}

const BiometricLockContext = createContext<BiometricLockContextValue | undefined>(undefined);

const BACKGROUND_TIMEOUT_MS = 5000;

export function BiometricLockProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useClerkAuth();
  const {
    isAvailable,
    isEnrolled,
    isEnabled,
    isLoading,
    biometricName,
    authenticate,
  } = useBiometricAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [shouldAutoTrigger, setShouldAutoTrigger] = useState(false);
  const appState = useRef(AppState.currentState);
  const lastBackgroundTime = useRef<number | null>(null);

  const shouldLock = Boolean(isSignedIn && isAvailable && isEnrolled && isEnabled && !isLoading);

  const unlock = useCallback(async () => {
    const success = await authenticate(`Unlock Meet Without Fear`);
    if (success) {
      setIsLocked(false);
      return { success: true };
    }

    return { success: false, error: 'authentication_failed' };
  }, [authenticate]);

  const checkLockOnForeground = useCallback(async () => {
    if (!shouldLock) {
      setIsLocked(false);
      setShouldAutoTrigger(false);
      return;
    }

    if (lastBackgroundTime.current) {
      const timeAway = Date.now() - lastBackgroundTime.current;
      if (timeAway < BACKGROUND_TIMEOUT_MS) {
        setIsLocked(false);
        setShouldAutoTrigger(false);
        return;
      }
    }

    setIsLocked(true);
    setShouldAutoTrigger(true);
  }, [shouldLock]);

  useEffect(() => {
    if (!shouldLock) {
      setIsLocked(false);
      setShouldAutoTrigger(false);
    }
  }, [shouldLock]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const previousState = appState.current;
      appState.current = nextAppState;

      if (
        previousState === 'active' &&
        (nextAppState === 'inactive' || nextAppState === 'background')
      ) {
        lastBackgroundTime.current = Date.now();
        if (shouldLock) {
          setIsLocked(true);
          setShouldAutoTrigger(false);
        }
      }

      if (
        (previousState === 'inactive' || previousState === 'background') &&
        nextAppState === 'active'
      ) {
        void checkLockOnForeground();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [checkLockOnForeground, shouldLock]);

  return (
    <BiometricLockContext.Provider
      value={{
        isLocked,
        biometricName: biometricName ?? 'Biometrics',
        shouldAutoTrigger,
        setShouldAutoTrigger,
        unlock,
      }}
    >
      {children}
    </BiometricLockContext.Provider>
  );
}

export function useBiometricLock() {
  const context = useContext(BiometricLockContext);
  if (!context) {
    throw new Error('useBiometricLock must be used within BiometricLockProvider');
  }
  return context;
}
