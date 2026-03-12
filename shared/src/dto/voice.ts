/**
 * Voice DTOs
 *
 * Data Transfer Objects for voice transcription features.
 */

// ============================================================================
// Voice Token
// ============================================================================

/**
 * Response from POST /api/v1/voice/token
 * Contains a short-lived AssemblyAI token for WebSocket streaming.
 */
export interface VoiceTokenResponseDTO {
  token: string;
  expiresInSeconds: number;
}
