/**
 * Voice Settings Screen
 *
 * Allows users to manage their voice and speech preferences.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Stack } from 'expo-router';
import { Volume2, Play, ChevronDown, Check } from 'lucide-react-native';
import { colors } from '@/src/theme';
import {
  useAutoSpeech,
  useVoiceSettings,
  VOICE_OPTIONS,
  VoiceModel,
} from '@/src/hooks/useSpeech';

export default function VoiceSettingsScreen() {
  // Speech settings
  const { isAutoSpeechEnabled, setAutoSpeechEnabled } = useAutoSpeech();
  const { voiceSettings, setVoiceId, previewVoice } = useVoiceSettings();
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  // Get current voice - always use FLASH_V2_5 (fast, cheap model)
  const currentVoice = VOICE_OPTIONS.find(v => v.id === voiceSettings.voiceId) || VOICE_OPTIONS[0];

  const handlePreviewVoice = async () => {
    setIsPreviewPlaying(true);
    try {
      // Always use FLASH_V2_5 (fast, cheap model)
      await previewVoice(voiceSettings.voiceId, VoiceModel.FLASH_V2_5);
    } finally {
      setIsPreviewPlaying(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Voice Settings',
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
        <View style={styles.section}>
          {/* Auto-Speech Toggle */}
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Volume2 color={colors.accent} size={22} />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-Speech</Text>
                <Text style={styles.settingDescription}>
                  Automatically speak AI responses
                </Text>
              </View>
            </View>
            <Switch
              value={isAutoSpeechEnabled}
              onValueChange={setAutoSpeechEnabled}
              trackColor={{ false: colors.bgTertiary, true: colors.accent }}
              thumbColor={colors.textPrimary}
            />
          </View>

          {/* Voice Selector */}
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowVoicePicker(!showVoicePicker)}
          >
            <View style={styles.pickerLeft}>
              <Text style={styles.pickerLabel}>Voice</Text>
              <Text style={styles.pickerValue}>{currentVoice.name}</Text>
              <Text style={styles.pickerDescription}>{currentVoice.description}</Text>
            </View>
            <ChevronDown
              color={colors.textSecondary}
              size={20}
              style={{ transform: [{ rotate: showVoicePicker ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>

          {showVoicePicker && (
            <View style={styles.pickerOptions}>
              {VOICE_OPTIONS.map((voice) => (
                <TouchableOpacity
                  key={voice.id}
                  style={[
                    styles.pickerOption,
                    voice.id === voiceSettings.voiceId && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    setVoiceId(voice.id);
                    setShowVoicePicker(false);
                  }}
                >
                  <View style={styles.pickerOptionLeft}>
                    <Text style={styles.pickerOptionName}>{voice.name}</Text>
                    <Text style={styles.pickerOptionDescription}>{voice.description}</Text>
                  </View>
                  {voice.id === voiceSettings.voiceId && (
                    <Check color={colors.accent} size={20} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Preview Button */}
          <TouchableOpacity
            style={styles.previewButton}
            onPress={handlePreviewVoice}
            disabled={isPreviewPlaying}
          >
            {isPreviewPlaying ? (
              <ActivityIndicator color={colors.textPrimary} size="small" />
            ) : (
              <>
                <Play color={colors.textPrimary} size={18} fill={colors.textPrimary} />
                <Text style={styles.previewButtonText}>Preview Voice</Text>
              </>
            )}
          </TouchableOpacity>
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
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 17,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Voice Settings styles
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
  },
  pickerLeft: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  pickerValue: {
    fontSize: 17,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  pickerDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pickerOptions: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgTertiary,
  },
  pickerOptionSelected: {
    backgroundColor: colors.bgTertiary,
  },
  pickerOptionLeft: {
    flex: 1,
  },
  pickerOptionName: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  pickerOptionDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  previewButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '600',
  },
});

