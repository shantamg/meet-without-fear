/**
 * EventRenderer
 *
 * Dispatches brain activity events to appropriate typed display components.
 * Falls back to generic view for unknown/null callTypes.
 */
import React from 'react';
import { BrainActivity, BrainActivityCallType, isSonnetCallType } from '../../types';
import { OrchestratedResponseEvent } from './OrchestratedResponseEvent';
import { PartnerSessionClassificationEvent } from './PartnerSessionClassificationEvent';
import { IntentDetectionEvent } from './IntentDetectionEvent';
import { RetrievalPlanningEvent } from './RetrievalPlanningEvent';
import { BackgroundClassificationEvent } from './BackgroundClassificationEvent';
import { ChatRouterResponseEvent } from './ChatRouterResponseEvent';
import { ReferenceDetectionEvent } from './ReferenceDetectionEvent';
import { PeopleExtractionEvent } from './PeopleExtractionEvent';
import { MemoryValidationEvent } from './MemoryValidationEvent';
import { ReconcilerAnalysisEvent } from './ReconcilerAnalysisEvent';
import { SummarizationEvent } from './SummarizationEvent';
import { NeedsExtractionEvent } from './NeedsExtractionEvent';
import { WitnessingResponseEvent } from './WitnessingResponseEvent';
import { MemoryFormattingEvent } from './MemoryFormattingEvent';
import { ThemeExtractionEvent } from './ThemeExtractionEvent';
import { GenericActivityEvent } from './GenericActivityEvent';

interface EventRendererProps {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

/**
 * Map of call types to their display components
 */
const EVENT_COMPONENTS: Record<BrainActivityCallType, React.FC<{ activity: BrainActivity; defaultExpanded?: boolean }>> = {
  ORCHESTRATED_RESPONSE: OrchestratedResponseEvent,
  RETRIEVAL_PLANNING: RetrievalPlanningEvent,
  INTENT_DETECTION: IntentDetectionEvent,
  BACKGROUND_CLASSIFICATION: BackgroundClassificationEvent,
  PARTNER_SESSION_CLASSIFICATION: PartnerSessionClassificationEvent,
  CHAT_ROUTER_RESPONSE: ChatRouterResponseEvent,
  REFERENCE_DETECTION: ReferenceDetectionEvent,
  PEOPLE_EXTRACTION: PeopleExtractionEvent,
  MEMORY_DETECTION: GenericActivityEvent, // Deprecated - memory detection removed
  MEMORY_VALIDATION: MemoryValidationEvent,
  RECONCILER_ANALYSIS: ReconcilerAnalysisEvent,
  SUMMARIZATION: SummarizationEvent,
  NEEDS_EXTRACTION: NeedsExtractionEvent,
  WITNESSING_RESPONSE: WitnessingResponseEvent,
  MEMORY_FORMATTING: MemoryFormattingEvent,
  THEME_EXTRACTION: ThemeExtractionEvent,
};

/**
 * Get the accent class based on whether this is a Sonnet or Haiku call
 */
export function getAccentClass(callType: BrainActivityCallType | null | undefined): string {
  if (isSonnetCallType(callType)) {
    return 'accent-warm';
  }
  return 'accent-cool';
}

/**
 * EventRenderer component
 *
 * Dispatches to the appropriate event component based on callType.
 * Falls back to GenericActivityEvent for unknown/null callTypes.
 */
export function EventRenderer({ activity, defaultExpanded = false }: EventRendererProps) {
  const callType = activity.callType;

  // Get the appropriate component for this call type
  const EventComponent = callType && EVENT_COMPONENTS[callType]
    ? EVENT_COMPONENTS[callType]
    : GenericActivityEvent;

  // Determine accent color class
  const accentClass = getAccentClass(callType);

  return (
    <div className={`event-wrapper ${accentClass}`}>
      <EventComponent activity={activity} defaultExpanded={defaultExpanded} />
    </div>
  );
}
