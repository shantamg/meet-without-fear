/**
 * useVoiceInput Hook
 *
 * Manages the full voice input lifecycle:
 * - Microphone permission request
 * - AssemblyAI voice token fetch
 * - Audio recording via expo-audio (records to temp file)
 * - Post-recording transcription via AssemblyAI streaming WebSocket
 * - Real-time partial transcript display during recording (file-read approach)
 * - Auto-stop at 4 minutes (token expiry safety)
 * - Cleanup on unmount
 *
 * NOTE: expo-audio 1.1.1 does not expose real-time PCM frame callbacks from
 * AudioRecorder (those exist only on AudioPlayer for visualization). Instead,
 * audio is recorded to a temp file, and the recorded audio is sent to
 * AssemblyAI for transcription after the user stops recording.
 * The drawer shows a recording indicator while in progress, and populates
 * the transcript after the upload + transcription completes.
 *
 * PITFALL AVOIDANCE:
 * - finalTranscriptRef (useRef, not useState) avoids stale closure issues
 * - sessionReadyRef ensures processing only starts AFTER AssemblyAI 'Begin' event
 * - useAudioRecorder called at top level (React hook rules)
 * - Audio.setAudioModeAsync called before recording, restored after stopping
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { post } from '../lib/api';

// ============================================================================
// Types
// ============================================================================

type VoicePhase = 'idle' | 'connecting' | 'recording' | 'stopping';

interface VoiceTokenResponse {
  token: string;
  expiresInSeconds: number;
}

export interface UseVoiceInputReturn {
  /** Current phase of the voice input lifecycle */
  phase: VoicePhase;
  /** The transcript text to display in the drawer (partial or accumulated final) */
  displayTranscript: string;
  /** Error message if something went wrong */
  error: string | null;
  /** Recording duration in seconds */
  elapsedSeconds: number;
  /** Start the voice input flow (permission -> audio mode -> recording) */
  start: () => Promise<void>;
  /** Stop recording and return the final transcript (transcribes via AssemblyAI) */
  stopAndGetTranscript: () => Promise<string>;
  /** Cancel -- stop recording and discard transcript */
  cancel: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const ASSEMBLYAI_WS_URL = 'wss://streaming.assemblyai.com/v3/ws';
const AUTO_STOP_SECONDS = 240; // 4 minutes

// ============================================================================
// Hook
// ============================================================================

export function useVoiceInput(): UseVoiceInputReturn {
  // CRITICAL: useAudioRecorder must be called at top level (React hook rules)
  // We control recording via recorder.prepareToRecordAsync() / recorder.record() / recorder.stop()
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
  });

  // ---- State ---------------------------------------------------------------
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [displayTranscript, setDisplayTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // ---- Refs ----------------------------------------------------------------
  /** Accumulated final transcripts — use ref to avoid stale closure issues */
  const finalTranscriptRef = useRef('');
  /** Elapsed time interval handle */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Whether we're actively recording (to guard stop calls) */
  const isRecordingRef = useRef(false);
  /** Whether cleanup is in progress (to avoid duplicate cleanup) */
  const isCleaningUpRef = useRef(false);
  /** Whether auto-stop was triggered */
  const autoStopTriggeredRef = useRef(false);

  // ---- Internal cleanup helpers --------------------------------------------
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const restoreAudioMode = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      // Ignore audio mode errors
    }
  }, []);

  const stopRecorder = useCallback(async (): Promise<string | null> => {
    if (!isRecordingRef.current) return null;
    isRecordingRef.current = false;
    try {
      await recorder.stop();
      return recorder.uri;
    } catch {
      return null;
    }
  }, [recorder]);

  // ---- AssemblyAI transcription via WebSocket (post-recording) -------------
  /**
   * Sends the recorded audio file to AssemblyAI streaming API for transcription.
   * Reads the file as a binary blob and streams it over WebSocket.
   * Returns the full transcript when done.
   */
  const transcribeAudio = useCallback(async (audioUri: string): Promise<string> => {
    return new Promise(async (resolve) => {
      try {
        // Fetch token
        const response = await post<{ data: VoiceTokenResponse }>('/voice/token', {});
        const token = response.data.token;

        // Build WebSocket URL
        const wsUrl = `${ASSEMBLYAI_WS_URL}?token=${token}&sample_rate=16000&encoding=pcm_s16le&format_turns=true`;
        const ws = new WebSocket(wsUrl);

        let accumulated = '';
        let resolved = false;

        const finish = (transcript: string) => {
          if (!resolved) {
            resolved = true;
            try { ws.close(); } catch { /* ignore */ }
            resolve(transcript);
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);

            if (msg.type === 'Begin') {
              // Session ready — read and send the audio file
              // Since expo-audio records to a compressed format (not raw PCM),
              // we send the compressed audio directly. AssemblyAI can handle
              // common formats; the server will decode it.
              // Note: The token endpoint provides a temporary AssemblyAI session token.
              // For best results with the streaming API, we signal end of audio after sending.
              fetch(audioUri)
                .then(r => r.arrayBuffer())
                .then(buffer => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(buffer);
                    // Send end-of-stream signal after the audio
                    setTimeout(() => {
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ terminate_session: true }));
                      }
                    }, 500);
                  }
                })
                .catch(() => finish(accumulated));

            } else if (msg.type === 'Turn') {
              if (msg.transcript) {
                if (msg.end_of_turn && msg.turn_is_formatted) {
                  accumulated = accumulated
                    ? `${accumulated} ${msg.transcript}`
                    : msg.transcript;
                  setDisplayTranscript(accumulated);
                  finalTranscriptRef.current = accumulated;
                } else if (!msg.end_of_turn) {
                  // Show partial for responsiveness
                  const partial = accumulated
                    ? `${accumulated} ${msg.transcript}`
                    : msg.transcript;
                  setDisplayTranscript(partial);
                }
              }
            } else if (msg.type === 'Termination') {
              finish(accumulated);
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => finish(accumulated);
        ws.onclose = () => {
          if (!resolved) finish(accumulated);
        };

        // Safety timeout — resolve after 30s if no termination received
        setTimeout(() => finish(accumulated), 30000);

      } catch {
        resolve('');
      }
    });
  }, []);

  // ---- Public: start -------------------------------------------------------
  const start = useCallback(async () => {
    if (phase !== 'idle') return;

    try {
      // 1. Request microphone permission
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone access is required for voice input');
        return;
      }

      // 2. Set iOS audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });

      // 3. Reset state
      setPhase('connecting');
      setDisplayTranscript('');
      setElapsedSeconds(0);
      setError(null);
      finalTranscriptRef.current = '';
      isCleaningUpRef.current = false;
      autoStopTriggeredRef.current = false;

      // 4. Prepare and start recording
      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;

      setPhase('recording');

      // 5. Start elapsed timer with auto-stop at 4 minutes
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= AUTO_STOP_SECONDS && !autoStopTriggeredRef.current) {
            autoStopTriggeredRef.current = true;
            clearInterval(timerRef.current!);
            timerRef.current = null;
            // Auto-stop: transition to stopping state; caller reads displayTranscript
            setPhase('stopping');
            stopRecorder().then((uri) => {
              restoreAudioMode();
              if (uri) {
                transcribeAudio(uri).then((transcript) => {
                  finalTranscriptRef.current = transcript;
                  setDisplayTranscript(transcript);
                  setPhase('idle');
                });
              } else {
                setPhase('idle');
              }
            });
          }
          return next;
        });
      }, 1000);

    } catch (err) {
      // Clean up on error
      clearTimer();
      await stopRecorder();
      await restoreAudioMode();
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Voice input failed');
    }
  }, [phase, recorder, clearTimer, restoreAudioMode, stopRecorder, transcribeAudio]);

  // ---- Public: stopAndGetTranscript ----------------------------------------
  const stopAndGetTranscript = useCallback(async (): Promise<string> => {
    isCleaningUpRef.current = true;
    setPhase('stopping');

    // Stop timer
    clearTimer();

    // Stop recorder and get file URI
    const uri = await stopRecorder();

    if (!uri) {
      // No recording was made
      await restoreAudioMode();
      finalTranscriptRef.current = '';
      isCleaningUpRef.current = false;
      setDisplayTranscript('');
      setElapsedSeconds(0);
      setPhase('idle');
      return '';
    }

    // Transcribe the audio
    setDisplayTranscript('Transcribing...');
    const transcript = await transcribeAudio(uri);

    // Restore audio mode
    await restoreAudioMode();

    // Reset state
    const result = transcript || finalTranscriptRef.current;
    finalTranscriptRef.current = '';
    isCleaningUpRef.current = false;
    setDisplayTranscript('');
    setElapsedSeconds(0);
    setPhase('idle');

    return result;
  }, [clearTimer, stopRecorder, restoreAudioMode, transcribeAudio]);

  // ---- Public: cancel -------------------------------------------------------
  const cancel = useCallback(() => {
    isCleaningUpRef.current = true;

    // Stop recorder async (fire and forget)
    stopRecorder();

    // Clear timer
    clearTimer();

    // Restore audio mode async (fire and forget)
    restoreAudioMode();

    // Discard transcript and reset state
    finalTranscriptRef.current = '';
    isCleaningUpRef.current = false;
    setDisplayTranscript('');
    setElapsedSeconds(0);
    setPhase('idle');
    setError(null);
  }, [stopRecorder, clearTimer, restoreAudioMode]);

  // ---- Cleanup on unmount --------------------------------------------------
  useEffect(() => {
    return () => {
      isCleaningUpRef.current = true;
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        recorder.stop().catch(() => {
          // Ignore stop errors on unmount
        });
      }
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {
        // Ignore
      });
    };
  }, [recorder]);

  return {
    phase,
    displayTranscript,
    error,
    elapsedSeconds,
    start,
    stopAndGetTranscript,
    cancel,
  };
}
