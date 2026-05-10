import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  InteractionManager,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';

import { useBiometricLock } from '@/src/contexts/BiometricLockContext';
import { Logo } from '@/src/components/Logo';
import { useAppAppearance } from '@/src/theme';

type LockState = 'locked' | 'authenticating' | 'unlocked';

export function BiometricLockOverlay() {
  const { isLocked, unlock, shouldAutoTrigger, setShouldAutoTrigger } = useBiometricLock();
  const { palette } = useAppAppearance();
  const [lockState, setLockState] = useState<LockState>('unlocked');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleBiometricAuth = async () => {
    setLockState('authenticating');

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

    setLockState('locked');
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

  if (!isLocked && lockState === 'unlocked') {
    return null;
  }

  return (
    <Modal
      visible
      transparent={false}
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <Animated.View
        style={[styles.overlay, { backgroundColor: palette.bg, opacity: fadeAnim }]}
        pointerEvents={isLocked ? 'auto' : 'none'}
      >
        <Pressable
          onPress={handleBiometricAuth}
          disabled={lockState === 'authenticating'}
          accessibilityRole="button"
          accessibilityLabel="Unlock Meet Without Fear"
        >
          <Logo size={144} />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

export default BiometricLockOverlay;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
