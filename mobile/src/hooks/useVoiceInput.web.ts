/**
 * Web stub for useVoiceInput.
 * Voice recording is not supported on web — returns idle state so the
 * mic button is never presented and text input is the only option.
 */

export type { UseVoiceInputReturn } from './useVoiceInput';

type VoicePhase = 'idle' | 'connecting' | 'recording' | 'stopping';

export function useVoiceInput() {
  return {
    phase: 'idle' as VoicePhase,
    displayTranscript: '',
    error: null as string | null,
    elapsedSeconds: 0,
    start: async () => {},
    stopAndGetTranscript: async () => '',
    cancel: () => {},
  };
}
