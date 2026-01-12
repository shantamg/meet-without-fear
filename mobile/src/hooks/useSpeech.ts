/**
 * useSpeech Hook
 *
 * Provides text-to-speech functionality using OpenAI API.
 * Features:
 * - High-quality AI voices via OpenAI (Alloy, Echo, Fable, Onyx, Nova, Shimmer)
 * - Speak text with configurable options
 * - Stop speech mid-playback
 * - Track speaking state
 * - Auto-speech setting support
 * - Audio caching for performance
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
// Use legacy API for downloadAsync (new API deprecated it but native download is more efficient)
import * as FileSystem from 'expo-file-system/legacy';
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

/** Available OpenAI models */
export enum VoiceModel {
  /** Standard text-to-speech model */
  TTS_1 = 'tts-1',
  /** High definition text-to-speech model */
  TTS_1_HD = 'tts-1-hd',
}

/** Voice option with metadata */
export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  /** Preview sample style */
  style: 'warm' | 'professional' | 'friendly' | 'calm' | 'energetic';
}

/** Available OpenAI voices */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'alloy', name: 'Alloy', description: 'Versatile and balanced', style: 'professional' },
  { id: 'echo', name: 'Echo', description: 'Warm and rounded', style: 'warm' },
  { id: 'fable', name: 'Fable', description: 'British accent, storytelling', style: 'friendly' },
  { id: 'onyx', name: 'Onyx', description: 'Deep and resonant', style: 'calm' },
  { id: 'nova', name: 'Nova', description: 'Energetic and feminine', style: 'energetic' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear and bright', style: 'friendly' },
];

/** Model tiers with pricing info - updated for OpenAI */
export const MODEL_OPTIONS: { model: VoiceModel; name: string; description: string }[] = [
  { model: VoiceModel.TTS_1, name: 'Standard', description: 'Fast, lower latency' },
  { model: VoiceModel.TTS_1_HD, name: 'High Def', description: 'Higher quality, slightly slower' },
];

/** Voice settings stored in AsyncStorage */
export interface VoiceSettings {
  voiceId: string;
  model: VoiceModel;
}

/** Default voice settings */
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceId: 'alloy',
  model: VoiceModel.TTS_1,
};

// ============================================================================
// Types
// ============================================================================

export interface SpeechState {
  /** Whether speech is currently playing */
  isSpeaking: boolean;
  /** The text currently being spoken (or last spoken) */
  currentText: string | null;
  /** ID of the current speech utterance */
  currentId: string | null;
}

export interface SpeechActions {
  /** Speak the given text */
  speak: (text: string, id?: string, slowSpeech?: boolean) => Promise<void>;
  /** Stop any ongoing speech */
  stop: () => Promise<void>;
  /** Toggle speech on/off for the given text */
  toggle: (text: string, id?: string, slowSpeech?: boolean) => Promise<void>;
  /** Play meditation script with pauses between segments */
  playMeditationScript: (script: string, id?: string) => Promise<void>;
}

export interface UseSpeechReturn extends SpeechState, SpeechActions { }

export interface UseAutoSpeechReturn {
  /** Whether auto-speech is enabled */
  isAutoSpeechEnabled: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Toggle auto-speech on/off */
  toggleAutoSpeech: () => void;
  /** Set auto-speech enabled state */
  setAutoSpeechEnabled: (enabled: boolean) => void;
}

// ============================================================================
// Query Keys
// ============================================================================

export const speechKeys = {
  autoSpeech: ['speech', 'auto'] as const,
  voiceSettings: ['speech', 'voice-settings'] as const,
};

// ============================================================================
// OpenAI TTS Utility
// ============================================================================

/** Cache directory for TTS audio files */
const TTS_CACHE_DIR = 'tts-cache';

/**
 * Simple hash function for generating cache keys from text.
 * Uses a basic string hash - not cryptographic, just for caching.
 */
function hashText(text: string, voiceId: string, model: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Include voice ID and model in hash so different settings have different caches
  return `${voiceId}_${model}_${Math.abs(hash).toString(16)}`;
}

/**
 * Gets the cached audio file for the given text, or fetches from OpenAI.
 * Uses native FileSystem.downloadAsync for maximum efficiency - bypasses JS thread entirely.
 * Returns the local file URI for playback.
 * @param slowSpeech - If true, uses slower speech rate (OpenAI speed param)
 */
async function getOrFetchTTSAudio(
  text: string,
  voiceSettings: VoiceSettings = DEFAULT_VOICE_SETTINGS,
  slowSpeech: boolean = false
): Promise<string> {
  // 1. Generate Cache Key
  const { voiceId } = voiceSettings;
  const model = voiceSettings.model || VoiceModel.TTS_1;
  const cacheKey = hashText(text, voiceId, `${model}_${slowSpeech ? 'slow' : 'normal'}`);

  // 2. Setup Directory and File Paths
  const cacheDir = `${FileSystem.cacheDirectory}${TTS_CACHE_DIR}/`;
  const fileUri = `${cacheDir}${cacheKey}.ogg`;

  // 3. Ensure Directory Exists
  const dirInfo = await FileSystem.getInfoAsync(cacheDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
  }

  // 4. Check Cache (Instant Return)
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (fileInfo.exists) {
    return fileUri;
  }

  // 5. NATIVE DOWNLOAD - bypasses JS thread entirely (Network -> Disk)
  // Uses GET with query params since downloadAsync doesn't reliably support POST body
  try {
    const token = await getAuthToken();
    const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const baseUrl = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

    // OpenAI Speed: 0.25 to 4.0. Default 1.0.
    const speed = slowSpeech ? 0.85 : 1.0;

    // Build URL with query params (GET request)
    const params = new URLSearchParams({
      text: text,
      voice: voiceId,
      model: model,
      speed: speed.toString(),
    });
    const ttsUrl = `${baseUrl}/tts?${params.toString()}`;

    const downloadResult = await FileSystem.downloadAsync(ttsUrl, fileUri, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (downloadResult.status !== 200) {
      // Clean up partial file if failed
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      throw new Error(`TTS Download failed with status ${downloadResult.status}`);
    }

    return fileUri;
  } catch (error) {
    console.error('[TTS] Download Error:', error);
    throw error;
  }
}

/**
 * Play text using OpenAI TTS.
 * Handles fetching audio, playing, and cleanup.
 * @param slowSpeech - If true, uses slower speech rate for meditation
 */
async function playTTS(
  text: string,
  voiceSettings: VoiceSettings,
  onStart?: () => void,
  onDone?: () => void,
  onError?: (error: Error) => void,
  soundRef?: React.MutableRefObject<Audio.Sound | null>,
  slowSpeech: boolean = false
): Promise<void> {
  try {
    // Configure audio session for playback (plays even in silent mode)
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      // Fix for Android volume ducking/mixing
    });

    // Get audio from cache or fetch from Backend
    const audioPath = await getOrFetchTTSAudio(text, voiceSettings, slowSpeech);

    // Create and play sound
    const { sound } = await Audio.Sound.createAsync(
      { uri: audioPath },
      { shouldPlay: true },
      (status) => {
        if (status.isLoaded && status.didJustFinish) {
          // Cleanup when done
          sound.unloadAsync().catch(console.warn);
          if (soundRef) {
            soundRef.current = null;
          }
          onDone?.();
        }
      }
    );

    // Store reference for stopping
    if (soundRef) {
      soundRef.current = sound;
    }

    onStart?.();
  } catch (error) {
    console.error('[playTTS] Error:', error);
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

// ============================================================================
// Main Hook: useSpeech
// ============================================================================

/**
 * Hook for text-to-speech functionality using OpenAI.
 * Provides speak, stop, and toggle actions with speaking state tracking.
 *
 * @example
 * ```tsx
 * const { isSpeaking, currentId, speak, stop, toggle } = useSpeech();
 *
 * // Speak text
 * await speak("Hello, world!", "message-123");
 *
 * // Stop speech
 * await stop();
 *
 * // Toggle (start/stop based on current state)
 * await toggle("Hello, world!", "message-123");
 * ```
 */
export function useSpeech(): UseSpeechReturn {
  const [state, setState] = useState<SpeechState>({
    isSpeaking: false,
    currentText: null,
    currentId: null,
  });

  // Load voice settings from storage
  const { data: voiceSettings } = useQuery({
    queryKey: speechKeys.voiceSettings,
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as VoiceSettings;
          // Validate that the stored model is valid for OpenAI, otherwise default
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

  // Use ref to track the current speech ID for callbacks
  const currentIdRef = useRef<string | null>(null);

  // Ref to the current sound for stopping
  const soundRef = useRef<Audio.Sound | null>(null);

  // Keep voice settings in a ref for use in callbacks
  const voiceSettingsRef = useRef<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  useEffect(() => {
    if (voiceSettings) {
      voiceSettingsRef.current = voiceSettings;
    }
  }, [voiceSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(console.warn);
        soundRef.current.unloadAsync().catch(console.warn);
      }
    };
  }, []);

  const speak = useCallback(async (text: string, id?: string, slowSpeech: boolean = false) => {
    // Stop any ongoing speech first
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {
        console.warn('[useSpeech] Error stopping previous speech:', e);
      }
      soundRef.current = null;
    }

    const speechId = id ?? text.slice(0, 50);
    currentIdRef.current = speechId;

    setState({
      isSpeaking: true,
      currentText: text,
      currentId: speechId,
    });

    await playTTS(
      text,
      voiceSettingsRef.current,
      // onStart
      () => {
        setState((prev) => ({
          ...prev,
          isSpeaking: true,
        }));
      },
      // onDone
      () => {
        if (currentIdRef.current === speechId) {
          setState({
            isSpeaking: false,
            currentText: null,
            currentId: null,
          });
        }
      },
      // onError
      (error) => {
        console.warn('[useSpeech] Speech error:', error);
        if (currentIdRef.current === speechId) {
          setState({
            isSpeaking: false,
            currentText: null,
            currentId: null,
          });
        }
      },
      soundRef,
      slowSpeech
    );
  }, []);

  const stop = useCallback(async () => {
    currentIdRef.current = null;

    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {
        console.warn('[useSpeech] Error stopping speech:', e);
      }
      soundRef.current = null;
    }

    setState({
      isSpeaking: false,
      currentText: null,
      currentId: null,
    });
  }, []);

  const toggle = useCallback(
    async (text: string, id?: string, slowSpeech: boolean = false) => {
      const speechId = id ?? text.slice(0, 50);

      // If currently speaking the same text, stop it
      if (state.isSpeaking && state.currentId === speechId) {
        await stop();
      } else {
        // Otherwise, start speaking (stops any other speech first)
        await speak(text, id, slowSpeech);
      }
    },
    [state.isSpeaking, state.currentId, speak, stop]
  );

  /**
   * Parse meditation script, split into segments, and play with pauses.
   * Uses shared parseMeditationScript utility for consistent parsing.
   * Supports [PAUSE:Xs] and [BELL] markers.
   */
  const playMeditationScript = useCallback(async (script: string, id?: string) => {
    // Use shared parser for consistent parsing
    const parsed = parseMeditationScript(script);
    const { segments } = parsed;

    const speechId = id ?? 'meditation-script';
    currentIdRef.current = speechId;

    setState({
      isSpeaking: true,
      currentText: script,
      currentId: speechId,
    });

    // Play each segment sequentially
    for (let i = 0; i < segments.length; i++) {
      // Check if we should stop
      if (currentIdRef.current !== speechId) {
        break;
      }

      const segment = segments[i];

      if (segment.type === 'pause' && segment.durationSeconds) {
        // Wait for the pause duration
        console.log(`[Meditation] Pausing for ${segment.durationSeconds} seconds`);
        await new Promise(resolve => setTimeout(resolve, segment.durationSeconds! * 1000));
      } else if (segment.type === 'bell') {
        // TODO: Play bell sound if we have one
        console.log('[Meditation] Bell marker (bell sound not implemented)');
      } else if (segment.type === 'speech' && segment.content) {
        // This is a text segment - play it with slow speech
        console.log(`[Meditation] Playing segment ${i + 1}/${segments.length}: "${segment.content.substring(0, 50)}..."`);

        try {
          // Wrap playTTS in a Promise that resolves when audio finishes
          await new Promise<void>((resolve, reject) => {
            playTTS(
              segment.content!,
              voiceSettingsRef.current,
              // onStart (only for first segment)
              i === 0 ? () => {
                setState((prev) => ({
                  ...prev,
                  isSpeaking: true,
                }));
              } : undefined,
              // onDone - resolve promise when this segment finishes
              () => {
                if (i === segments.length - 1) {
                  // Last segment - update state
                  if (currentIdRef.current === speechId) {
                    setState({
                      isSpeaking: false,
                      currentText: null,
                      currentId: null,
                    });
                  }
                }
                resolve();
              },
              // onError
              (error) => {
                console.warn('[Meditation] Speech error:', error);
                if (currentIdRef.current === speechId) {
                  setState({
                    isSpeaking: false,
                    currentText: null,
                    currentId: null,
                  });
                }
                reject(error);
              },
              soundRef,
              true // slowSpeech = true for meditation
            ).catch(reject);
          });
        } catch (error) {
          console.error('[Meditation] Error playing segment:', error);
          if (currentIdRef.current === speechId) {
            setState({
              isSpeaking: false,
              currentText: null,
              currentId: null,
            });
          }
          break;
        }
      }
    }
  }, []);

  return {
    ...state,
    speak,
    stop,
    toggle,
    playMeditationScript,
  };
}

// ============================================================================
// Auto-Speech Settings Hook
// ============================================================================

/**
 * Hook for managing auto-speech setting.
 * Persists preference to AsyncStorage.
 *
 * @example
 * ```tsx
 * const { isAutoSpeechEnabled, toggleAutoSpeech, setAutoSpeechEnabled } = useAutoSpeech();
 *
 * // Toggle setting
 * toggleAutoSpeech();
 *
 * // Or set explicitly
 * setAutoSpeechEnabled(true);
 * ```
 */
export function useAutoSpeech(): UseAutoSpeechReturn {
  const queryClient = useQueryClient();

  // Query for current auto-speech setting
  const { data: isAutoSpeechEnabled = false, isLoading } = useQuery({
    queryKey: speechKeys.autoSpeech,
    queryFn: async () => {
      const value = await AsyncStorage.getItem(AUTO_SPEECH_STORAGE_KEY);
      return value === 'true';
    },
    staleTime: Infinity, // Setting doesn't change from server
  });

  // Mutation to update setting
  const { mutate: setAutoSpeechEnabled } = useMutation({
    mutationFn: async (enabled: boolean) => {
      await AsyncStorage.setItem(AUTO_SPEECH_STORAGE_KEY, enabled ? 'true' : 'false');
      return enabled;
    },
    onMutate: async (enabled) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: speechKeys.autoSpeech });
      const previousValue = queryClient.getQueryData<boolean>(speechKeys.autoSpeech);
      queryClient.setQueryData(speechKeys.autoSpeech, enabled);
      return { previousValue };
    },
    onError: (_err, _enabled, context) => {
      // Rollback on error
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

  return {
    isAutoSpeechEnabled,
    isLoading,
    toggleAutoSpeech,
    setAutoSpeechEnabled,
  };
}

// ============================================================================
// Voice Settings Hook
// ============================================================================

// Map voice IDs to local assets
const VOICE_PREVIEWS: Record<string, any> = {
  alloy: require('../../assets/sounds/voices/alloy.mp3'),
  echo: require('../../assets/sounds/voices/echo.mp3'),
  fable: require('../../assets/sounds/voices/fable.mp3'),
  onyx: require('../../assets/sounds/voices/onyx.mp3'),
  nova: require('../../assets/sounds/voices/nova.mp3'),
  shimmer: require('../../assets/sounds/voices/shimmer.mp3'),
};

export interface UseVoiceSettingsReturn {
  /** Current voice settings */
  voiceSettings: VoiceSettings;
  /** Loading state */
  isLoading: boolean;
  /** Update voice ID */
  setVoiceId: (voiceId: string) => void;
  /** Update model */
  setModel: (model: VoiceModel) => void;
  /** Update both at once */
  setVoiceSettings: (settings: VoiceSettings) => void;
  /** Preview a voice (speaks sample text) */
  previewVoice: (voiceId: string, model: VoiceModel) => Promise<void>;
}

/**
 * Hook for managing voice settings.
 * Persists preference to AsyncStorage.
 *
 * @example
 * ```tsx
 * const { voiceSettings, setVoiceId, setModel, previewVoice } = useVoiceSettings();
 *
 * // Change voice
 * setVoiceId('alloy');
 *
 * // Change model
 * setModel(VoiceModel.TTS_1);
 *
 * // Preview a voice
 * await previewVoice('alloy', VoiceModel.TTS_1);
 * ```
 */
export function useVoiceSettings(): UseVoiceSettingsReturn {
  const queryClient = useQueryClient();

  // Query for current voice settings
  const { data: voiceSettings = DEFAULT_VOICE_SETTINGS, isLoading } = useQuery({
    queryKey: speechKeys.voiceSettings,
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as VoiceSettings;
          // Validate that the stored model is valid for OpenAI, otherwise default
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

  // Mutation to update settings
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

  const setVoiceId = useCallback((voiceId: string) => {
    updateSettings({ ...voiceSettings, voiceId });
  }, [voiceSettings, updateSettings]);

  const setModel = useCallback((model: VoiceModel) => {
    updateSettings({ ...voiceSettings, model });
  }, [voiceSettings, updateSettings]);

  const setVoiceSettings = useCallback((settings: VoiceSettings) => {
    updateSettings(settings);
  }, [updateSettings]);

  // Preview sound ref for cleanup
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  // Cleanup preview sound on unmount
  useEffect(() => {
    return () => {
      if (previewSoundRef.current) {
        previewSoundRef.current.stopAsync().catch(console.warn);
        previewSoundRef.current.unloadAsync().catch(console.warn);
      }
    };
  }, []);

  // Map voice IDs to local assets


  const previewVoice = useCallback(async (voiceId: string, model: VoiceModel) => {
    // Stop any existing preview
    if (previewSoundRef.current) {
      try {
        await previewSoundRef.current.stopAsync();
        await previewSoundRef.current.unloadAsync();
      } catch {
        // Ignore errors
      }
      previewSoundRef.current = null;
    }

    try {
      const asset = VOICE_PREVIEWS[voiceId];
      if (asset) {
        console.log(`[Preview] Playing local asset for ${voiceId}`);
        // Configure audio session for playback (plays even in silent mode)
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          asset,
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              previewSoundRef.current = null;
              sound.unloadAsync().catch(console.warn);
            }
          }
        );
        previewSoundRef.current = sound;
      } else {
        // Fallback to generating if local asset missing (unlikely)
        console.warn(`[Preview] Local asset not found for ${voiceId}, falling back to API`);
        const previewText = "Hello! I'm here to support you on your journey.";
        await playTTS(
          previewText,
          { voiceId, model },
          undefined,
          () => {
            previewSoundRef.current = null;
          },
          undefined,
          previewSoundRef
        );
      }
    } catch (error) {
      console.error('[Preview] Error playing preview:', error);
    }
  }, []);

  return {
    voiceSettings,
    isLoading,
    setVoiceId,
    setModel,
    setVoiceSettings,
    previewVoice,
  };
}

// ============================================================================
// Utility: Check if speech is available
// ============================================================================

/**
 * Check if text-to-speech is available.
 * Since we moved to backend, it's always available if backend is up.
 */
export async function isSpeechAvailable(): Promise<boolean> {
  return true;
}
