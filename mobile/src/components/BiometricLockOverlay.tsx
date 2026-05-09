import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { Lock, LogOut, RefreshCw, ShieldCheck } from 'lucide-react-native';

import { useBiometricLock } from '@/src/contexts/BiometricLockContext';
import { colors } from '@/src/theme';

type LockState = 'locked' | 'authenticating' | 'failed' | 'unlocked';

export function BiometricLockOverlay() {
  const { isLocked, biometricName, unlock, shouldAutoTrigger, setShouldAutoTrigger } =
    useBiometricLock();
  const { signOut } = useClerkAuth();
  const [lockState, setLockState] = useState<LockState>('unlocked');
  const [error, setError] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleBiometricAuth = async () => {
    setLockState('authenticating');
    setError('');

    const result = await unlock();
    if (result.success) {
      setLockState('unlocked');
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    setLockState('failed');
    setError(`Could not unlock with ${biometricName}. Try again or use your device passcode.`);
  };

  useEffect(() => {
    if (isLocked) {
      setLockState('locked');
      fadeAnim.setValue(1);
    } else {
      setLockState('unlocked');
      fadeAnim.setValue(0);
    }
  }, [fadeAnim, isLocked]);

  useEffect(() => {
    if (lockState === 'locked' && shouldAutoTrigger) {
      setShouldAutoTrigger(false);
      InteractionManager.runAfterInteractions(() => {
        void handleBiometricAuth();
      });
    }
  }, [lockState, shouldAutoTrigger, setShouldAutoTrigger]);

  const handleSignOut = async () => {
    await signOut();
    setLockState('unlocked');
    router.replace('/(public)');
  };

  if (!isLocked && lockState === 'unlocked') {
    return null;
  }

  const isBusy = lockState === 'authenticating';
  const isFailed = lockState === 'failed';

  return (
    <Animated.View
      style={[styles.overlay, { opacity: fadeAnim }]}
      pointerEvents={isLocked ? 'auto' : 'none'}
    >
      <View style={styles.content}>
        <View style={styles.mark}>
          {isFailed ? (
            <Lock size={52} color={colors.brandOrange} strokeWidth={1.6} />
          ) : (
            <ShieldCheck size={58} color={colors.brandBlue} strokeWidth={1.5} />
          )}
        </View>

        <Text style={styles.title}>
          {isFailed ? 'Authentication failed' : 'Meet Without Fear is locked'}
        </Text>
        <Text style={styles.subtitle}>
          {isFailed
            ? error
            : `Use ${biometricName} or your device passcode to continue.`}
        </Text>

        {isBusy ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={styles.loadingText}>Authenticating...</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleBiometricAuth}
            accessibilityRole="button"
          >
            <RefreshCw size={18} color={colors.textOnAccent} />
            <Text style={styles.primaryButtonText}>
              {isFailed ? `Try ${biometricName} again` : `Unlock with ${biometricName}`}
            </Text>
          </TouchableOpacity>
        )}

        {isFailed && (
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            accessibilityRole="button"
          >
            <LogOut size={17} color={colors.error} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

export default BiometricLockOverlay;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  mark: {
    width: 118,
    height: 118,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0,
    marginBottom: 10,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 28,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.brandOrange,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  signOutButton: {
    marginTop: 16,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '700',
  },
});
