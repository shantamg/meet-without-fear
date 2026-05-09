/**
 * Privacy Settings Screen
 *
 * Allows users to manage their privacy preferences.
 */

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Shield, Eye, Users, FileText, ExternalLink } from 'lucide-react-native';
import { designFonts, useAppAppearance } from '@/src/theme';
import { usePrivacyPreferences, useUpdatePrivacyPreferences } from '@/src/hooks/useProfile';

export default function PrivacySettingsScreen() {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { data: privacyPreferencesData, isLoading: isLoadingPrivacyPreferences } = usePrivacyPreferences();
  const updatePrivacyPreferences = useUpdatePrivacyPreferences({
    onError: () => {
      Alert.alert('Error', 'Could not update privacy settings. Please try again.');
    },
  });
  const [shareAnonymousAnalytics, setShareAnonymousAnalytics] = useState(true);
  const privacyPreferences = privacyPreferencesData?.preferences;
  const showActivityStatus = privacyPreferences?.showActivityStatus ?? true;
  const allowSessionInvites = privacyPreferences?.allowSessionInvites ?? true;
  const privacyControlsDisabled = isLoadingPrivacyPreferences || updatePrivacyPreferences.isPending;

  const handlePrivacyPolicyPress = () => {
    WebBrowser.openBrowserAsync('https://meetwithoutfear.com/privacy').catch(() => {
      Alert.alert('Error', 'Could not open Privacy Policy');
    });
  };

  const handleTermsPress = () => {
    WebBrowser.openBrowserAsync('https://meetwithoutfear.com/terms').catch(() => {
      Alert.alert('Error', 'Could not open Terms of Service');
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
            backgroundColor: palette.bg,
          },
          headerTintColor: palette.text,
          headerTitleStyle: {
            fontWeight: '600',
            color: palette.text,
            fontFamily: designFonts.sans,
          },
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Privacy Info */}
        <View style={styles.infoCard}>
          <Shield color={palette.accent} size={24} />
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
                <Eye color={palette.accent} size={20} />
                <Text style={styles.settingLabel}>Show Activity Status</Text>
              </View>
              <Text style={styles.settingDescription}>
                Let others see when you were last active
              </Text>
            </View>
            <Switch
              value={showActivityStatus}
              onValueChange={(showActivityStatus) => {
                updatePrivacyPreferences.mutate({ showActivityStatus });
              }}
              trackColor={{ false: palette.chipBg, true: palette.accent }}
              thumbColor={palette.bgElev}
              disabled={privacyControlsDisabled}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <Users color={palette.accent} size={20} />
                <Text style={styles.settingLabel}>Allow Session Invites</Text>
              </View>
              <Text style={styles.settingDescription}>
                Others can invite you to conflict resolution sessions
              </Text>
            </View>
            <Switch
              value={allowSessionInvites}
              onValueChange={(allowSessionInvites) => {
                updatePrivacyPreferences.mutate({ allowSessionInvites });
              }}
              trackColor={{ false: palette.chipBg, true: palette.accent }}
              thumbColor={palette.bgElev}
              disabled={privacyControlsDisabled}
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
              trackColor={{ false: palette.chipBg, true: palette.accent }}
              thumbColor={palette.bgElev}
            />
          </View>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <TouchableOpacity style={styles.linkItem} onPress={handlePrivacyPolicyPress}>
            <View style={styles.linkItemLeft}>
              <FileText color={palette.accent} size={20} />
              <Text style={styles.linkItemLabel}>Privacy Policy</Text>
            </View>
            <ExternalLink color={palette.textMuted} size={18} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkItem} onPress={handleTermsPress}>
            <View style={styles.linkItemLeft}>
              <FileText color={palette.accent} size={20} />
              <Text style={styles.linkItemLabel}>Terms of Service</Text>
            </View>
            <ExternalLink color={palette.textMuted} size={18} />
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

const makeStyles = (palette: ReturnType<typeof useAppAppearance>['palette']) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
    fontFamily: designFonts.sans,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
    fontFamily: designFonts.sans,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
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
    color: palette.text,
    fontWeight: '500',
    fontFamily: designFonts.sans,
  },
  settingDescription: {
    fontSize: 13,
    color: palette.textMuted,
    marginLeft: 28,
    fontFamily: designFonts.sans,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  linkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkItemLabel: {
    fontSize: 16,
    color: palette.text,
    fontWeight: '500',
    fontFamily: designFonts.sans,
  },
  notice: {
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: palette.accent,
  },
  noticeText: {
    fontSize: 13,
    color: palette.textMuted,
    lineHeight: 20,
    fontFamily: designFonts.sans,
  },
});
