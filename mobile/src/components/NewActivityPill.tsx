import { useRef, useEffect } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { createStyles } from '../theme/styled';

interface NewActivityPillProps {
  visible: boolean;
  partnerName: string;
  onPress: () => void;
  /** Called when the pill auto-dismisses after timeout, so parent can clear state */
  onAutoDismiss?: () => void;
  testID?: string;
}

export function NewActivityPill({
  visible,
  partnerName,
  onPress,
  onAutoDismiss,
  testID = 'new-activity-pill',
}: NewActivityPillProps) {
  const styles = useStyles();
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Animate in/out based on visibility
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 60,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  // 15s auto-dismiss: animate out after timeout and notify parent
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 60,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Notify parent so it can clear pendingPillTarget state
        onAutoDismiss?.();
      });
    }, 15000);
    return () => clearTimeout(timer);
  }, [visible, translateY, opacity, onAutoDismiss]);

  const label = `${partnerName} shared something new`;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable
        onPress={onPress}
        style={styles.pill}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Tap to scroll to it.`}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.text}>{label}</Text>
        <ChevronDown size={14} color="#292524" />
      </Pressable>
    </Animated.View>
  );
}

const useStyles = () =>
  createStyles(() => ({
    container: {
      position: 'absolute',
      bottom: 60,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 10,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(245, 158, 11, 0.9)',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    },
    text: {
      color: '#292524',
      fontSize: 14,
      fontWeight: '600',
    },
  }));
