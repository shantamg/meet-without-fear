/**
 * useSpeech Hook
 *
 * Provides text-to-speech functionality using ElevenLabs API.
 * Features:
 * - High-quality AI voices via ElevenLabs
 * - Speak text with configurable options
 * - Stop speech mid-playback
 * - Track speaking state
 * - Auto-speech setting support
 * - Audio caching for performance
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { File, Directory, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Constants
// ============================================================================

const AUTO_SPEECH_STORAGE_KEY = '@meet-without-fear/auto-speech-enabled';
const VOICE_SETTINGS_STORAGE_KEY = '@meet-without-fear/voice-settings';

/** ElevenLabs API configuration */
const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || 'YOUR_API_KEY_HERE';

// ============================================================================
// Voice Configuration
// ============================================================================

/** Available ElevenLabs models */
export enum VoiceModel {
  /** High quality, low latency */
  TURBO = 'eleven_turbo_v2_5',
  /** High quality multilingual */
  MULTILINGUAL_V2 = 'eleven_multilingual_v2',
  /** Lowest latency, most cost-effective */
  FLASH_V2_5 = 'eleven_flash_v2_5',
}

/** Voice option with metadata */
export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  /** Preview sample style */
  style: 'warm' | 'professional' | 'friendly' | 'calm' | 'energetic';
}

/** Available voices */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Warm, conversational British', style: 'warm' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Calm, clear American', style: 'calm' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', description: 'Soft, gentle American', style: 'friendly' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Well-rounded, expressive', style: 'professional' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', description: 'Deep, warm American', style: 'warm' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Deep, clear narrator', style: 'professional' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', description: 'Raspy, authentic American', style: 'energetic' },
];

/** Model tiers with pricing info */
export const MODEL_OPTIONS: { model: VoiceModel; name: string; description: string }[] = [
  { model: VoiceModel.TURBO, name: 'Standard', description: 'High fidelity, balanced speed' },
  { model: VoiceModel.MULTILINGUAL_V2, name: 'Premium', description: 'Legacy multilingual support' },
  { model: VoiceModel.FLASH_V2_5, name: 'Lightning', description: 'Fastest response, lowest cost' },
];

/** Voice settings stored in AsyncStorage */
export interface VoiceSettings {
  voiceId: string;
  model: VoiceModel;
}

/** Default voice settings */
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceId: 'JBFqnCBsd6RMkjVDRZzb', // George
  model: VoiceModel.FLASH_V2_5,
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

export interface UseSpeechReturn extends SpeechState, SpeechActions {}

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
// ElevenLabs TTS Utility
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
 * Gets the cached audio file for the given text, or fetches from ElevenLabs.
 * Returns the local file URI for playback.
 * @param slowSpeech - If true, uses slower speech rate for meditation
 */
async function getOrFetchTTSAudio(
  text: string,
  voiceSettings: VoiceSettings = DEFAULT_VOICE_SETTINGS,
  slowSpeech: boolean = false
): Promise<string> {
  const { voiceId } = voiceSettings;
  // Always use FLASH_V2_5 (fast, cheap model)
  const model = VoiceModel.FLASH_V2_5;
  // Include slowSpeech in cache key so slow and normal versions are cached separately
  const cacheKey = hashText(text, voiceId, `${model}_${slowSpeech ? 'slow' : 'normal'}`);
  const cacheDir = new Directory(Paths.cache, TTS_CACHE_DIR);
  const cachedFile = new File(cacheDir, `${cacheKey}.mp3`);

  // Check if cached file exists
  try {
    if (cachedFile.exists) {
      console.log('[TTS] Using cached audio:', cacheKey);
      return cachedFile.uri;
    }
  } catch {
    // File doesn't exist, continue to fetch
  }

  console.log('[TTS] Fetching from ElevenLabs:', cacheKey, 'voice:', voiceId, 'model:', model, 'slow:', slowSpeech);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  // For slow speech (meditation), use the slowest speed (0.7)
  // Speed range: 0.7 to 1.2 (default: 1.0)
  const voiceSettingsConfig = slowSpeech
    ? {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
        speed: 0.7, // Slowest speed for meditation
      }
    : {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
        speed: 1.0, // Normal speed for regular speech
      };

  const textToSpeak = text;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: textToSpeak,
      model_id: model,
      voice_settings: voiceSettingsConfig,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  // Get the audio data as ArrayBuffer
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Ensure cache directory exists
  try {
    if (!cacheDir.exists) {
      cacheDir.create();
    }
  } catch {
    // Directory might already exist
  }

  // Write the audio data to cached file
  await cachedFile.write(uint8Array);

  return cachedFile.uri;
}

/**
 * Play text using ElevenLabs TTS.
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
    });

    // Get audio from cache or fetch from ElevenLabs
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
 * Hook for text-to-speech functionality using ElevenLabs.
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
  // Always use FLASH_V2_5 (fast, cheap model) regardless of stored value
  const { data: voiceSettings } = useQuery({
    queryKey: speechKeys.voiceSettings,
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as VoiceSettings;
          // Always force FLASH_V2_5 model
          return { ...parsed, model: VoiceModel.FLASH_V2_5 };
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
   * Strips out [PAUSE Xs] and [BELL] markers and plays segments sequentially.
   */
  const playMeditationScript = useCallback(async (script: string, id?: string) => {
    // Parse script: split by pause markers and bell markers
    // Pattern: [PAUSE 30s], [PAUSE 60s], [BELL], etc.
    const pausePattern = /\[PAUSE\s+(\d+)s?\]/gi;
    const bellPattern = /\[BELL\]/gi;
    
    // Replace markers with a special delimiter we can split on
    let processedScript = script
      .replace(pausePattern, (match, seconds) => `|||PAUSE:${seconds}|||`)
      .replace(bellPattern, '|||BELL|||');
    
    // Split by our delimiter
    const segments = processedScript.split('|||').filter(seg => seg.trim().length > 0);
    
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

      const segment = segments[i].trim();
      
      if (segment.startsWith('PAUSE:')) {
        // Extract pause duration
        const pauseSeconds = parseInt(segment.replace('PAUSE:', ''), 10);
        if (!isNaN(pauseSeconds) && pauseSeconds > 0) {
          console.log(`[Meditation] Pausing for ${pauseSeconds} seconds`);
          // Wait for the pause duration
          await new Promise(resolve => setTimeout(resolve, pauseSeconds * 1000));
        }
      } else if (segment === 'BELL') {
        // TODO: Play bell sound if we have one
        console.log('[Meditation] Bell marker (bell sound not implemented)');
      } else if (segment.length > 0) {
        // This is a text segment - play it with slow speech
        console.log(`[Meditation] Playing segment ${i + 1}/${segments.length}: "${segment.substring(0, 50)}..."`);
        
        try {
          // Wrap playTTS in a Promise that resolves when audio finishes
          await new Promise<void>((resolve, reject) => {
            playTTS(
              segment,
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
 * setVoiceId('21m00Tcm4TlvDq8ikWAM');
 *
 * // Change model
 * setModel(VoiceModel.MULTILINGUAL_V2);
 *
 * // Preview a voice
 * await previewVoice('21m00Tcm4TlvDq8ikWAM', VoiceModel.TURBO);
 * ```
 */
export function useVoiceSettings(): UseVoiceSettingsReturn {
  const queryClient = useQueryClient();

  // Query for current voice settings
  // Always use FLASH_V2_5 (fast, cheap model) regardless of stored value
  const { data: voiceSettings = DEFAULT_VOICE_SETTINGS, isLoading } = useQuery({
    queryKey: speechKeys.voiceSettings,
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as VoiceSettings;
          // Always force FLASH_V2_5 model
          return { ...parsed, model: VoiceModel.FLASH_V2_5 };
        } catch {
          return DEFAULT_VOICE_SETTINGS;
        }
      }
      return DEFAULT_VOICE_SETTINGS;
    },
    staleTime: Infinity,
  });

  // Mutation to update settings
  // Always save with FLASH_V2_5 (fast, cheap model)
  const { mutate: updateSettings } = useMutation({
    mutationFn: async (settings: VoiceSettings) => {
      // Always force FLASH_V2_5 model
      const settingsWithModel = { ...settings, model: VoiceModel.FLASH_V2_5 };
      await AsyncStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settingsWithModel));
      return settingsWithModel;
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
    // Always use FLASH_V2_5 model
    updateSettings({ ...voiceSettings, voiceId, model: VoiceModel.FLASH_V2_5 });
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

    const previewText = "Hello! I'm here to support you on your journey.";
    // Always use FLASH_V2_5 (fast, cheap model) regardless of passed model
    await playTTS(
      previewText,
      { voiceId, model: VoiceModel.FLASH_V2_5 },
      undefined,
      () => {
        previewSoundRef.current = null;
      },
      undefined,
      previewSoundRef
    );
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
 * Check if text-to-speech is available (ElevenLabs API key is configured).
 */
export async function isSpeechAvailable(): Promise<boolean> {
  return ELEVENLABS_API_KEY !== 'YOUR_API_KEY_HERE' && ELEVENLABS_API_KEY.length > 0;
}
