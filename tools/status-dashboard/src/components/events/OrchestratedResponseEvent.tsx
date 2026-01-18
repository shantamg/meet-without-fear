/**
 * OrchestratedResponseEvent
 *
 * Displays user-facing Sonnet responses with optional thinking/analysis blocks.
 */
import React, { useState } from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function OrchestratedResponseEvent({ activity, defaultExpanded }: Props) {
  const [showThinking, setShowThinking] = useState(false);

  const structured = activity.structuredOutput || {};

  // Handle activity.output being either a string or {text, stopReason} object
  const rawOutput = activity.output;
  const outputText = typeof rawOutput === 'string'
    ? rawOutput
    : (rawOutput?.text || '');

  const responseText = structured.response || structured.text || outputText;
  const thinking = structured.thinking || structured.analysis || structured.reasoning;

  const preview = typeof responseText === 'string'
    ? responseText.substring(0, 100)
    : '';

  return (
    <BaseEventWrapper
      activity={activity}
      title="AI Response"
      icon="💬"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {/* Response text */}
        {responseText && (
          <div className="response-text">
            <h4>Response</h4>
            <p className="text-content">{responseText}</p>
          </div>
        )}

        {/* Collapsible thinking/analysis section */}
        {thinking && (
          <div className="thinking-section">
            <button
              className="thinking-toggle"
              onClick={() => setShowThinking(!showThinking)}
            >
              {showThinking ? '▼' : '▶'} Thinking / Analysis
            </button>
            {showThinking && (
              <div className="thinking-content">
                <pre>{typeof thinking === 'string' ? thinking : JSON.stringify(thinking, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
