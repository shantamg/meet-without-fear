/**
 * Web implementation of useSpeech.
 * Replaces expo-av Audio with HTML5 Audio element and
 * skips expo-file-system caching (browser handles HTTP caching).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseMeditationScript } from '@meet-without-fear/shared';

// ============================================================================
// Constants
// ============================================================================

const AUTO_SPEECH_STORAGE_KEY = '@meet-without-fear/auto-speech-enabled';
const VOICE_SETTINGS_STORAGE_KEY = '@meet-without-fear/voice-settings';

// ============================================================================
// Voice Configuration
// ============================================================================

export enum VoiceModel {
  TTS_1 = 'tts-1',
  TTS_1_HD = 'tts-1-hd',
}

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  style: 'warm' | 'professional' | 'friendly' | 'calm' | 'energetic';
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'alloy', name: 'Alloy', description: 'Versatile and balanced', style: 'professional' },
  { id: 'echo', name: 'Echo', description: 'Warm and rounded', style: 'warm' },
  { id: 'fable', name: 'Fable', description: 'British accent, storytelling', style: 'friendly' },
  { id: 'onyx', name: 'Onyx', description: 'Deep and resonant', style: 'calm' },
  { id: 'nova', name: 'Nova', description: 'Energetic and feminine', style: 'energetic' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear and bright', style: 'friendly' },
];

export const MODEL_OPTIONS: { model: VoiceModel; name: string; description: string }[] = [
  { model: VoiceModel.TTS_1, name: 'Standard', description: 'Fast, lower latency' },
  { model: VoiceModel.TTS_1_HD, name: 'High Def', description: 'Higher quality, slightly slower' },
];

export interface VoiceSettings {
  voiceId: string;
  model: VoiceModel;
}

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceId: 'alloy',
  model: VoiceModel.TTS_1,
};

// ============================================================================
// Types
// ============================================================================

export interface SpeechState {
  isSpeaking: boolean;
  currentText: string | null;
  currentId: string | null;
}

export interface SpeechActions {
  speak: (text: string, id?: string, slowSpeech?: boolean) => Promise<void>;
  stop: () => Promise<void>;
  toggle: (text: string, id?: string, slowSpeech?: boolean) => Promise<void>;
  playMeditationScript: (script: string, id?: string) => Promise<void>;
}

export interface UseSpeechReturn extends SpeechState, SpeechActions {}

export interface UseAutoSpeechReturn {
  isAutoSpeechEnabled: boolean;
  isLoading: boolean;
  toggleAutoSpeech: () => void;
  setAutoSpeechEnabled: (enabled: boolean) => void;
}

export const speechKeys = {
  autoSpeech: ['speech', 'auto'] as const,
  voiceSettings: ['speech', 'voice-settings'] as const,
};

// ============================================================================
// Web Audio Utility
// ============================================================================

/**
 * Build the TTS URL for the backend endpoint.
 * On web, we pass the URL directly to the HTML5 Audio element
 * and let the browser handle caching via HTTP cache headers.
 */
function buildTTSUrl(
  text: string,
  voiceSettings: VoiceSettings = DEFAULT_VOICE_SETTINGS,
  slowSpeech: boolean = false,
): string {
  const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
  const baseUrl = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
  const speed = slowSpeech ? 0.85 : 1.0;

  const params = new URLSearchParams({
    text,
    voice: voiceSettings.voiceId,
    model: voiceSettings.model,
    speed: speed.toString(),
  });

  return `${baseUrl}/tts?${params.toString()}`;
}

/**
 * Play audio from a URL using HTML5 Audio.
 * Returns a cleanup function to stop playback.
 */
async function playWebAudio(
  url: string,
  token: string,
  onDone?: () => void,
  onError?: (error: Error) => void,
): Promise<HTMLAudioElement> {
  // Fetch audio with auth header, then create a blob URL
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`TTS fetch failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const audio = new Audio(blobUrl);

  audio.onended = () => {
    URL.revokeObjectURL(blobUrl);
    onDone?.();
  };

  audio.onerror = () => {
    URL.revokeObjectURL(blobUrl);
    onError?.(new Error('Audio playback failed'));
  };

  await audio.play();
  return audio;
}

// ============================================================================
// Main Hook: useSpeech
// ============================================================================

export function useSpeech(): UseSpeechReturn {
  const [state, setState] = useState<SpeechState>({
    isSpeaking: false,
    currentText: null,
    currentId: null,
  });

  const { data: voiceSettings } = useQuery({
    queryKey: speechKeys.voiceSettings,
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as VoiceSettings;
          if (parsed.model !== VoiceModel.TTS_1 && parsed.model !== VoiceModel.TTS_1_HD) {
            return DEFAULT_VOICE_SETTINGS;
          }
          return parsed;
        } catch {
          return DEFAULT_VOICE_SETTINGS;
        }
      }
      return DEFAULT_VOICE_SETTINGS;
    },
    staleTime: Infinity,
  });

  const currentIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceSettingsRef = useRef<VoiceSettings>(DEFAULT_VOICE_SETTINGS);

  useEffect(() => {
    if (voiceSettings) {
      voiceSettingsRef.current = voiceSettings;
    }
  }, [voiceSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
  }, []);

  const speak = useCallback(async (text: string, id?: string, slowSpeech: boolean = false) => {
    stopAudio();

    const speechId = id ?? text.slice(0, 50);
    currentIdRef.current = speechId;

    setState({
      isSpeaking: true,
      currentText: text,
      currentId: speechId,
    });

    try {
      const token = await getAuthToken();
      const url = buildTTSUrl(text, voiceSettingsRef.current, slowSpeech);

      const audio = await playWebAudio(
        url,
        token || '',
        // onDone
        () => {
          if (currentIdRef.current === speechId) {
            setState({ isSpeaking: false, currentText: null, currentId: null });
          }
          audioRef.current = null;
        },
        // onError
        (error) => {
          console.warn('[useSpeech web] Playback error:', error);
          if (currentIdRef.current === speechId) {
            setState({ isSpeaking: false, currentText: null, currentId: null });
          }
          audioRef.current = null;
        },
      );

      audioRef.current = audio;
    } catch (error) {
      console.error('[useSpeech web] Error:', error);
      if (currentIdRef.current === speechId) {
        setState({ isSpeaking: false, currentText: null, currentId: null });
      }
    }
  }, [stopAudio]);

  const stop = useCallback(async () => {
    currentIdRef.current = null;
    stopAudio();
    setState({ isSpeaking: false, currentText: null, currentId: null });
  }, [stopAudio]);

  const toggle = useCallback(
    async (text: string, id?: string, slowSpeech: boolean = false) => {
      const speechId = id ?? text.slice(0, 50);
      if (state.isSpeaking && state.currentId === speechId) {
        await stop();
      } else {
        await speak(text, id, slowSpeech);
      }
    },
    [state.isSpeaking, state.currentId, speak, stop],
  );

  const playMeditationScript = useCallback(async (script: string, id?: string) => {
    const parsed = parseMeditationScript(script);
    const { segments } = parsed;

    const speechId = id ?? 'meditation-script';
    currentIdRef.current = speechId;

    setState({ isSpeaking: true, currentText: script, currentId: speechId });

    for (let i = 0; i < segments.length; i++) {
      if (currentIdRef.current !== speechId) break;

      const segment = segments[i];

      if (segment.type === 'pause' && segment.durationSeconds) {
        await new Promise(resolve => setTimeout(resolve, segment.durationSeconds! * 1000));
      } else if (segment.type === 'speech' && segment.content) {
        try {
          await new Promise<void>((resolve, reject) => {
            const token = getAuthToken();
            token.then(t => {
              const url = buildTTSUrl(segment.content!, voiceSettingsRef.current, true);
              playWebAudio(
                url,
                t || '',
                () => {
                  if (i === segments.length - 1 && currentIdRef.current === speechId) {
                    setState({ isSpeaking: false, currentText: null, currentId: null });
                  }
                  resolve();
                },
                (error) => {
                  if (currentIdRef.current === speechId) {
                    setState({ isSpeaking: false, currentText: null, currentId: null });
                  }
                  reject(error);
                },
              ).then(audio => {
                audioRef.current = audio;
              }).catch(reject);
            }).catch(reject);
          });
        } catch (error) {
          console.error('[Meditation web] Error playing segment:', error);
          if (currentIdRef.current === speechId) {
            setState({ isSpeaking: false, currentText: null, currentId: null });
          }
          break;
        }
      }
    }
  }, []);

  return { ...state, speak, stop, toggle, playMeditationScript };
}

// ============================================================================
// Auto-Speech Settings Hook
// ============================================================================

export function useAutoSpeech(): UseAutoSpeechReturn {
  const queryClient = useQueryClient();

  const { data: isAutoSpeechEnabled = false, isLoading } = useQuery({
    queryKey: speechKeys.autoSpeech,
    queryFn: async () => {
      const value = await AsyncStorage.getItem(AUTO_SPEECH_STORAGE_KEY);
      return value === 'true';
    },
    staleTime: Infinity,
  });

  const { mutate: setAutoSpeechEnabled } = useMutation({
    mutationFn: async (enabled: boolean) => {
      await AsyncStorage.setItem(AUTO_SPEECH_STORAGE_KEY, enabled ? 'true' : 'false');
      return enabled;
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: speechKeys.autoSpeech });
      const previousValue = queryClient.getQueryData<boolean>(speechKeys.autoSpeech);
      queryClient.setQueryData(speechKeys.autoSpeech, enabled);
      return { previousValue };
    },
    onError: (_err, _enabled, context) => {
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(speechKeys.autoSpeech, context.previousValue);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: speechKeys.autoSpeech });
    },
  });

  const toggleAutoSpeech = useCallback(() => {
    setAutoSpeechEnabled(!isAutoSpeechEnabled);
  }, [isAutoSpeechEnabled, setAutoSpeechEnabled]);

  return { isAutoSpeechEnabled, isLoading, toggleAutoSpeech, setAutoSpeechEnabled };
}

// ============================================================================
// Voice Settings Hook
// ============================================================================

export interface UseVoiceSettingsReturn {
  voiceSettings: VoiceSettings;
  isLoading: boolean;
  setVoiceId: (voiceId: string) => void;
  setModel: (model: VoiceModel) => void;
  setVoiceSettings: (settings: VoiceSettings) => void;
  previewVoice: (voiceId: string, model: VoiceModel) => Promise<void>;
}

export function useVoiceSettings(): UseVoiceSettingsReturn {
  const queryClient = useQueryClient();

  const { data: voiceSettings = DEFAULT_VOICE_SETTINGS, isLoading } = useQuery({
    queryKey: speechKeys.voiceSettings,
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as VoiceSettings;
          if (parsed.model !== VoiceModel.TTS_1 && parsed.model !== VoiceModel.TTS_1_HD) {
            return DEFAULT_VOICE_SETTINGS;
          }
          return parsed;
        } catch {
          return DEFAULT_VOICE_SETTINGS;
        }
      }
      return DEFAULT_VOICE_SETTINGS;
    },
    staleTime: Infinity,
  });

  const { mutate: updateSettings } = useMutation({
    mutationFn: async (settings: VoiceSettings) => {
      await AsyncStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      return settings;
    },
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: speechKeys.voiceSettings });
      const previousValue = queryClient.getQueryData<VoiceSettings>(speechKeys.voiceSettings);
      queryClient.setQueryData(speechKeys.voiceSettings, settings);
      return { previousValue };
    },
    onError: (_err, _settings, context) => {
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(speechKeys.voiceSettings, context.previousValue);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: speechKeys.voiceSettings });
    },
  });

  const setVoiceId = useCallback(
    (voiceId: string) => updateSettings({ ...voiceSettings, voiceId }),
    [voiceSettings, updateSettings],
  );

  const setModel = useCallback(
    (model: VoiceModel) => updateSettings({ ...voiceSettings, model }),
    [voiceSettings, updateSettings],
  );

  const setVoiceSettings = useCallback(
    (settings: VoiceSettings) => updateSettings(settings),
    [updateSettings],
  );

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const previewVoice = useCallback(async (voiceId: string, model: VoiceModel) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    try {
      const token = await getAuthToken();
      const previewText = "Hello! I'm here to support you on your journey.";
      const url = buildTTSUrl(previewText, { voiceId, model });

      const audio = await playWebAudio(
        url,
        token || '',
        () => { previewAudioRef.current = null; },
        () => { previewAudioRef.current = null; },
      );
      previewAudioRef.current = audio;
    } catch (error) {
      console.error('[Preview web] Error:', error);
    }
  }, []);

  return { voiceSettings, isLoading, setVoiceId, setModel, setVoiceSettings, previewVoice };
}

// ============================================================================
// Utility
// ============================================================================

export async function isSpeechAvailable(): Promise<boolean> {
  return true;
}
