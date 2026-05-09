/**
 * Voice Settings Screen
 *
 * Allows users to manage their voice and speech preferences.
 */

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { Stack } from 'expo-router';
import { Volume2, ChevronDown, Check } from 'lucide-react-native';
import { designFonts, useAppAppearance } from '@/src/theme';
import {
  useAutoSpeech,
  useVoiceSettings,
  VOICE_OPTIONS,
  VoiceModel,
} from '@/src/hooks/useSpeech';

export default function VoiceSettingsScreen() {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  // Speech settings
  const { isAutoSpeechEnabled, setAutoSpeechEnabled } = useAutoSpeech();
  const { voiceSettings, setVoiceId, previewVoice } = useVoiceSettings();

  const [showVoicePicker, setShowVoicePicker] = useState(false);

  // Get current voice
  const currentVoice = VOICE_OPTIONS.find(v => v.id === voiceSettings.voiceId) || VOICE_OPTIONS[0];



  return (
    <>
      <Stack.Screen
        options={{
          title: 'Voice Settings',
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
        <View style={styles.section}>
          {/* Auto-Speech Toggle */}
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Volume2 color={palette.accent} size={22} />
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
              trackColor={{ false: palette.chipBg, true: palette.accent }}
              thumbColor={palette.bgElev}
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
              color={palette.textMuted}
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
                    // Auto-play preview
                    previewVoice(voice.id, VoiceModel.TTS_1).catch(console.error);
                  }}
                >
                  <View style={styles.pickerOptionLeft}>
                    <Text style={styles.pickerOptionName}>{voice.name}</Text>
                    <Text style={styles.pickerOptionDescription}>{voice.description}</Text>
                  </View>
                  {voice.id === voiceSettings.voiceId && (
                    <Check color={palette.accent} size={20} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}


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
    color: palette.text,
    fontWeight: '500',
    fontFamily: designFonts.sans,
  },
  settingDescription: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
    fontFamily: designFonts.sans,
  },
  // Voice Settings styles
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pickerLeft: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: 12,
    color: palette.textMuted,
    marginBottom: 4,
    fontFamily: designFonts.sans,
  },
  pickerValue: {
    fontSize: 17,
    color: palette.text,
    fontWeight: '500',
    fontFamily: designFonts.sans,
  },
  pickerDescription: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
    fontFamily: designFonts.sans,
  },
  pickerOptions: {
    backgroundColor: palette.bgElev,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.divider,
  },
  pickerOptionSelected: {
    backgroundColor: palette.selected,
  },
  pickerOptionLeft: {
    flex: 1,
  },
  pickerOptionName: {
    fontSize: 16,
    color: palette.text,
    fontWeight: '500',
    fontFamily: designFonts.sans,
  },
  pickerOptionDescription: {
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
    fontFamily: designFonts.sans,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  previewButtonText: {
    fontSize: 16,
    color: palette.bg,
    fontWeight: '600',
    fontFamily: designFonts.sans,
  },
});
