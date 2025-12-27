/**
 * NotificationBanner Component for BeHeard Mobile
 *
 * A dismissible banner for displaying important notifications at the top of the screen.
 * Used for permission prompts and important alerts.
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell, X, ChevronRight } from 'lucide-react-native';

// ============================================================================
// Types
// ============================================================================

export interface NotificationBannerProps {
  /** Banner title */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Called when banner is dismissed */
  onDismiss?: () => void;
  /** Banner variant */
  variant?: 'info' | 'warning' | 'permission';
  /** Custom icon component */
  icon?: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Notification banner for important alerts and permission prompts.
 *
 * @example
 * ```tsx
 * <NotificationBanner
 *   title="Enable Notifications"
 *   description="Stay updated on your mediation sessions"
 *   variant="permission"
 *   action={{
 *     label: "Enable",
 *     onPress: () => requestPermission()
 *   }}
 *   onDismiss={() => setShowBanner(false)}
 * />
 * ```
 */
export function NotificationBanner({
  title,
  description,
  action,
  onDismiss,
  variant = 'info',
  icon,
}: NotificationBannerProps) {
  const variantStyles = getVariantStyles(variant);

  const renderIcon = () => {
    if (icon) return icon;

    return (
      <View style={[styles.iconContainer, variantStyles.iconContainer]}>
        <Bell color={variantStyles.iconColor} size={20} />
      </View>
    );
  };

  return (
    <View style={[styles.container, variantStyles.container]} testID="notification-banner">
      {renderIcon()}

      <View style={styles.content}>
        <Text style={[styles.title, variantStyles.title]}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>

      {action && (
        <TouchableOpacity
          style={[styles.actionButton, variantStyles.actionButton]}
          onPress={action.onPress}
          testID="notification-banner-action"
        >
          <Text style={[styles.actionText, variantStyles.actionText]}>{action.label}</Text>
          <ChevronRight color={variantStyles.actionIconColor} size={16} />
        </TouchableOpacity>
      )}

      {onDismiss && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onDismiss}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          testID="notification-banner-close"
        >
          <X color="#6B7280" size={18} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// Permission Banner - Specialized component for notification permission prompts
// ============================================================================

export interface PermissionBannerProps {
  /** Called when user taps to enable notifications */
  onEnable: () => void;
  /** Called when user dismisses the banner */
  onDismiss: () => void;
}

/**
 * Specialized banner for requesting notification permissions.
 *
 * @example
 * ```tsx
 * {permissionStatus === 'undetermined' && (
 *   <PermissionBanner
 *     onEnable={() => requestPermission()}
 *     onDismiss={() => setDismissed(true)}
 *   />
 * )}
 * ```
 */
export function PermissionBanner({ onEnable, onDismiss }: PermissionBannerProps) {
  return (
    <NotificationBanner
      title="Enable Notifications"
      description="Get updates when your partner responds or joins a session"
      variant="permission"
      action={{
        label: 'Enable',
        onPress: onEnable,
      }}
      onDismiss={onDismiss}
    />
  );
}

// ============================================================================
// Variant Styles
// ============================================================================

interface VariantStyle {
  container: object;
  iconContainer: object;
  iconColor: string;
  title: object;
  actionButton: object;
  actionText: object;
  actionIconColor: string;
}

function getVariantStyles(variant: NotificationBannerProps['variant']): VariantStyle {
  switch (variant) {
    case 'warning':
      return {
        container: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
        iconContainer: { backgroundColor: '#FDE68A' },
        iconColor: '#D97706',
        title: { color: '#92400E' },
        actionButton: { backgroundColor: '#F59E0B' },
        actionText: { color: '#FFFFFF' },
        actionIconColor: '#FFFFFF',
      };
    case 'permission':
      return {
        container: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
        iconContainer: { backgroundColor: '#E0E7FF' },
        iconColor: '#4F46E5',
        title: { color: '#312E81' },
        actionButton: { backgroundColor: '#4F46E5' },
        actionText: { color: '#FFFFFF' },
        actionIconColor: '#FFFFFF',
      };
    default:
      return {
        container: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
        iconContainer: { backgroundColor: '#E5E7EB' },
        iconColor: '#6B7280',
        title: { color: '#1F2937' },
        actionButton: { backgroundColor: '#374151' },
        actionText: { color: '#FFFFFF' },
        actionIconColor: '#FFFFFF',
      };
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 2,
  },
  closeButton: {
    padding: 4,
  },
});
