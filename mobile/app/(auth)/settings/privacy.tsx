/**
 * Privacy Settings Screen
 *
 * Allows users to manage their privacy preferences.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { Shield, Eye, Users, FileText, ExternalLink } from 'lucide-react-native';
import { colors } from '@/src/theme';

export default function PrivacySettingsScreen() {
  // Local state for privacy settings - in a full implementation these would
  // be persisted to the backend via API hooks
  const [showActivityStatus, setShowActivityStatus] = useState(true);
  const [allowSessionInvites, setAllowSessionInvites] = useState(true);
  const [shareAnonymousAnalytics, setShareAnonymousAnalytics] = useState(true);

  const handlePrivacyPolicyPress = () => {
    // Open privacy policy in browser
    Linking.openURL('https://meetwithoutfear.com/privacy').catch(() => {
      Alert.alert('Error', 'Could not open privacy policy');
    });
  };

  const handleTermsPress = () => {
    // Open terms of service in browser
    Linking.openURL('https://meetwithoutfear.com/terms').catch(() => {
      Alert.alert('Error', 'Could not open terms of service');
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Privacy',
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: colors.bgPrimary,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: '600',
            color: colors.textPrimary,
          },
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Privacy Info */}
        <View style={styles.infoCard}>
          <Shield color={colors.accent} size={24} />
          <Text style={styles.infoText}>
            Your privacy is important to us. Control how your information is shared and used.
          </Text>
        </View>

        {/* Visibility Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visibility</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <Eye color={colors.accent} size={20} />
                <Text style={styles.settingLabel}>Show Activity Status</Text>
              </View>
              <Text style={styles.settingDescription}>
                Let others see when you were last active
              </Text>
            </View>
            <Switch
              value={showActivityStatus}
              onValueChange={setShowActivityStatus}
              trackColor={{ false: colors.bgTertiary, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <Users color={colors.accent} size={20} />
                <Text style={styles.settingLabel}>Allow Session Invites</Text>
              </View>
              <Text style={styles.settingDescription}>
                Others can invite you to conflict resolution sessions
              </Text>
            </View>
            <Switch
              value={allowSessionInvites}
              onValueChange={setAllowSessionInvites}
              trackColor={{ false: colors.bgTertiary, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        {/* Data & Analytics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Analytics</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Share Anonymous Analytics</Text>
              <Text style={styles.settingDescription}>
                Help us improve by sharing anonymous usage data
              </Text>
            </View>
            <Switch
              value={shareAnonymousAnalytics}
              onValueChange={setShareAnonymousAnalytics}
              trackColor={{ false: colors.bgTertiary, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <TouchableOpacity style={styles.linkItem} onPress={handlePrivacyPolicyPress}>
            <View style={styles.linkItemLeft}>
              <FileText color={colors.accent} size={20} />
              <Text style={styles.linkItemLabel}>Privacy Policy</Text>
            </View>
            <ExternalLink color={colors.textSecondary} size={18} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkItem} onPress={handleTermsPress}>
            <View style={styles.linkItemLeft}>
              <FileText color={colors.accent} size={20} />
              <Text style={styles.linkItemLabel}>Terms of Service</Text>
            </View>
            <ExternalLink color={colors.textSecondary} size={18} />
          </TouchableOpacity>
        </View>

        {/* Data Protection Notice */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Your session data and conversations are encrypted and never shared with third parties.
            We only use your data to provide and improve our services.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  settingLabel: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 28,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
  },
  linkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkItemLabel: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  notice: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  noticeText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
