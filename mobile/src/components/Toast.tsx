/**
 * Toast Component for BeHeard Mobile
 *
 * Animated in-app notification banner that slides down from top.
 */

import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react-native';

// ============================================================================
// Types
// ============================================================================

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastProps {
  /** Toast title */
  title: string;
  /** Optional body text */
  body?: string;
  /** Optional action button */
  action?: ToastAction;
  /** Called when toast is dismissed */
  onDismiss: () => void;
  /** Duration in milliseconds before auto-dismiss (default: 6000) */
  duration?: number;
  /** Toast variant for styling */
  variant?: 'default' | 'success' | 'error' | 'warning';
}

// ============================================================================
// Component
// ============================================================================

/**
 * Toast notification component.
 *
 * Slides in from the top of the screen and auto-dismisses after a set duration.
 *
 * @example
 * ```tsx
 * <Toast
 *   title="Session Invite"
 *   body="John invited you to a session"
 *   action={{ label: "View", onPress: () => router.push('/session/123') }}
 *   onDismiss={() => setShowToast(false)}
 * />
 * ```
 */
export function Toast({
  title,
  body,
  action,
  onDismiss,
  duration = 6000,
  variant = 'default',
}: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide in with spring animation
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss timer
    const timer = setTimeout(() => {
      dismiss();
    }, duration);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const handleActionPress = () => {
    action?.onPress();
    dismiss();
  };

  const variantStyles = getVariantStyles(variant);

  return (
    <Animated.View
      style={[
        styles.container,
        variantStyles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      testID="toast-container"
    >
      <View style={styles.content}>
        <Text style={[styles.title, variantStyles.title]} numberOfLines={1}>
          {title}
        </Text>
        {body && (
          <Text style={styles.body} numberOfLines={2}>
            {body}
          </Text>
        )}
      </View>

      {action && (
        <TouchableOpacity
          style={[styles.actionButton, variantStyles.actionButton]}
          onPress={handleActionPress}
          testID="toast-action"
        >
          <Text style={[styles.actionText, variantStyles.actionText]}>{action.label}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.closeButton}
        onPress={dismiss}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        testID="toast-close"
      >
        <X color="#6B7280" size={20} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// Variant Styles
// ============================================================================

function getVariantStyles(variant: ToastProps['variant']) {
  switch (variant) {
    case 'success':
      return {
        container: { borderLeftColor: '#10B981', borderLeftWidth: 4 },
        title: { color: '#065F46' },
        actionButton: { backgroundColor: '#10B981' },
        actionText: { color: '#FFFFFF' },
      };
    case 'error':
      return {
        container: { borderLeftColor: '#EF4444', borderLeftWidth: 4 },
        title: { color: '#991B1B' },
        actionButton: { backgroundColor: '#EF4444' },
        actionText: { color: '#FFFFFF' },
      };
    case 'warning':
      return {
        container: { borderLeftColor: '#F59E0B', borderLeftWidth: 4 },
        title: { color: '#92400E' },
        actionButton: { backgroundColor: '#F59E0B' },
        actionText: { color: '#FFFFFF' },
      };
    default:
      return {
        container: {},
        title: {},
        actionButton: {},
        actionText: {},
      };
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 9999,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  body: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 6,
    marginRight: 8,
  },
  actionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
});
