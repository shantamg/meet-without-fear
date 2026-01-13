/**
 * Hooks Index
 *
 * Central export point for all React Query hooks and custom hooks.
 */

// ============================================================================
// Authentication
// ============================================================================

export { useAuth, useAuthProvider, AuthContext, useUpdateMood, authKeys } from './useAuth';
export type { User, AuthContextValue } from './useAuth';

// ============================================================================
// Invitation Deep Links
// ============================================================================

export {
  useInvitationLink,
  usePendingInvitation,
  getPendingInvitation,
  clearPendingInvitation,
  createInvitationLink,
  useInvitationDetails,
  type InvitationStatus,
  type InvitationDetails,
  type InvitationErrorType,
  type UseInvitationDetailsState,
} from './useInvitation';

// ============================================================================
// Sessions
// ============================================================================

export {
  // Query keys
  sessionKeys,
  // Types
  type ListSessionsParams,
  // Hooks
  useSessions,
  useInfiniteSessions,
  useSession,
  useSessionState,
  useCreateSession,
  usePauseSession,
  useResumeSession,
  useArchiveSession,
  // Invitation hooks
  useInvitation,
  useAcceptInvitation,
  useDeclineInvitation,
  useResendInvitation,
} from './useSessions';

// ============================================================================
// Messages
// ============================================================================

export {
  // Query keys
  messageKeys,
  // Types
  type GetMessagesParams,
  type SendMessageParams,
  // Hooks
  useMessages,
  useInfiniteMessages,
  useSendMessage,
  // Emotional barometer
  useEmotionalHistory,
  useRecordEmotion,
  useCompleteExercise,
  // Optimistic updates
  useOptimisticMessage,
} from './useMessages';

// ============================================================================
// Profile
// ============================================================================

export {
  // Query keys
  profileKeys,
  // Hooks
  useProfile,
  useUpdateProfile,
  useUpdatePushToken,
  useUnregisterPushToken,
  useAblyToken,
  useDeleteAccount,
  useExportData,
} from './useProfile';

// ============================================================================
// Stages
// ============================================================================

export {
  // Query keys
  stageKeys,
  // Progress
  useProgress,
  // Stage 0: Compact
  useCompactStatus,
  useSignCompact,
  // Stage 1: Feel Heard
  useConfirmFeelHeard,
  // Stage 2: Empathy
  useEmpathyDraft,
  useSaveEmpathyDraft,
  useConsentToShareEmpathy,
  usePartnerEmpathy,
  useValidateEmpathy,
  // Stage 3: Needs
  useNeeds,
  useConfirmNeeds,
  useAddNeed,
  useConsentShareNeeds,
  useCommonGround,
  useConfirmCommonGround,
  // Stage 4: Strategies
  useStrategies,
  useProposeStrategy,
  useRequestStrategySuggestions,
  useMarkReadyToRank,
  useSubmitRankings,
  useStrategiesReveal,
  // Agreements
  useAgreements,
  useCreateAgreement,
  useConfirmAgreement,
  useResolveSession,
} from './useStages';

// ============================================================================
// Emotions (legacy - uses stub API, prefer useMessages emotion hooks)
// ============================================================================

export {
  useEmotions,
  type EmotionRecord,
  type ExerciseRecord,
  type RecordEmotionInput,
  type CompleteExerciseInput,
} from './useEmotions';

// ============================================================================
// People/Relationships
// ============================================================================

export {
  // Query keys
  personKeys,
  // Types
  type SessionStatus as PersonSessionStatus,
  type ActiveSessionInfo,
  type PersonDTO,
  type PastSessionDTO,
  type GetPersonResponse,
  type GetPastSessionsResponse,
  // Hooks
  usePerson,
  usePastSessions,
  usePeople,
} from './usePerson';

// ============================================================================
// Realtime (WebSocket)
// ============================================================================

export {
  // Types
  type RealtimeConfig,
  type RealtimeState,
  type RealtimeActions,
  // Main hook
  useRealtime,
  // Convenience hooks
  usePartnerTyping,
  usePartnerPresence,
  useSessionEvents,
} from './useRealtime';

// ============================================================================
// Biometric Authentication
// ============================================================================

export {
  useBiometricAuth,
  type BiometricAuthState,
  type BiometricAuthActions,
  type UseBiometricAuthReturn,
} from './useBiometricAuth';

// ============================================================================
// Unified Session (Chat-Centric Interface)
// ============================================================================

export {
  useUnifiedSession,
  type OverlayType,
  type InlineCardType,
  type InlineChatCard,
} from './useUnifiedSession';

// ============================================================================
// Router Chat (Chat-First Session Creation)
// ============================================================================

export {
  useRouterChat,
  type UseRouterChatOptions,
  type UseRouterChatReturn,
} from './useRouterChat';

// ============================================================================
// Inner Thoughts (Solo Self-Reflection, optionally linked to partner sessions)
// ============================================================================

export {
  // Query keys
  innerThoughtsKeys,
  innerWorkKeys, // Legacy alias
  // Types
  type ListInnerThoughtsParams,
  type CreateInnerThoughtsRequest,
  // Hooks - New names
  useInnerThoughtsSessions,
  useInnerThoughtsSessionsInfinite,
  useInnerThoughtsSession,
  useCreateInnerThoughtsSession,
  useSendInnerThoughtsMessage,
  useUpdateInnerThoughtsSession,
  useArchiveInnerThoughtsSession,
  useLinkedInnerThoughts,
  useGenerateContext,
  // Legacy aliases
  useInnerWorkSessions,
  useInnerWorkSession,
  useCreateInnerWorkSession,
  useSendInnerWorkMessage,
  useUpdateInnerWorkSession,
  useArchiveInnerWorkSession,
} from './useInnerThoughts';

// ============================================================================
// Memories ("Things to Always Remember")
// ============================================================================

export {
  // Query keys
  memoryKeys,
  // Hooks
  useMemories,
  useCreateMemory,
  useUpdateMemory,
  useDeleteMemory,
  useApproveMemory,
  useRejectMemory,
} from './useMemories';

// ============================================================================
// Needs Assessment ("Am I OK?")
// ============================================================================

export {
  // Query keys
  needsKeys,
  // Hooks
  useNeedsReference,
  useNeedsState,
  useSubmitBaseline,
  useCheckInNeed,
  useNeedHistory,
  useUpdateNeedsPreferences,
  // Helpers
  groupNeedsByCategory,
  getLowNeeds,
  getHighNeeds,
  calculateOverallScore,
} from './useNeedsAssessment';

// ============================================================================
// Gratitude ("See the Positive")
// ============================================================================

export {
  // Query keys
  gratitudeKeys,
  // Hooks
  useGratitudeEntries,
  useInfiniteGratitudeEntries,
  useGratitudeEntry,
  useCreateGratitude,
  useDeleteGratitude,
  useGratitudePatterns,
  useGratitudePreferences,
  useUpdateGratitudePreferences,
  useGratitudePrompt,
  // Helpers
  calculateStreak,
  getTodaysEntries,
} from './useGratitude';

// ============================================================================
// Meditation ("Develop Loving Awareness")
// ============================================================================

export {
  // Query keys
  meditationKeys,
  // Session hooks
  useMeditationSessions,
  useCreateMeditationSession,
  useUpdateMeditationSession,
  // Stats
  useMeditationStats,
  // AI features
  useMeditationSuggestion,
  useGenerateMeditationScript,
  // Favorites
  useMeditationFavorites,
  useCreateMeditationFavorite,
  useDeleteMeditationFavorite,
  // Preferences
  useMeditationPreferences,
  useUpdateMeditationPreferences,
  // Saved Meditations (Custom User-Created)
  useSavedMeditations,
  useSavedMeditation,
  useCreateSavedMeditation,
  useUpdateSavedMeditation,
  useDeleteSavedMeditation,
  useParseMeditationText,
  // Helpers
  getDurationOptions,
  getFocusAreaSuggestions,
  formatDuration,
  formatTotalTime,
} from './useMeditation';

// ============================================================================
// Inner Work Hub (Overview & Cross-Feature Intelligence)
// ============================================================================

export {
  // Query keys
  innerWorkKeys as innerWorkHubKeys,
  // Hooks
  useInnerWorkOverview,
  useCrossFeatureContext,
  useInsights,
  useDismissInsight,
  // Helpers
  hasCompletedOnboarding,
  getSuggestedAction,
  calculateWellnessScore,
} from './useInnerWorkOverview';

// ============================================================================
// Speech (Text-to-Speech)
// ============================================================================

export {
  // Query keys
  speechKeys,
  // Hooks
  useSpeech,
  useAutoSpeech,
  // Utilities
  isSpeechAvailable,
  // Types
  type SpeechState,
  type SpeechActions,
  type UseSpeechReturn,
  type UseAutoSpeechReturn,
} from './useSpeech';

// ============================================================================
// Session Drawer (Hamburger Menu Navigation)
// ============================================================================

export {
  // Context Provider
  SessionDrawerProvider,
  // Hook
  useSessionDrawer,
  // Types
  type DrawerTab,
  type SessionDrawerContextValue,
} from './useSessionDrawer';
