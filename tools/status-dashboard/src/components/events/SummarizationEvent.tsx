/**
 * SummarizationEvent
 *
 * Displays summarization output.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function SummarizationEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const summary = structured.summary || structured.text || activity.output;
  const keyPoints = structured.keyPoints || structured.highlights || [];
  const topics = structured.topics || structured.mainTopics || [];
  const wordCount = structured.wordCount || structured.length;

  const keyPointList = Array.isArray(keyPoints) ? keyPoints : [];
  const topicList = Array.isArray(topics) ? topics : [];

  const summaryText = typeof summary === 'string' ? summary : '';
  const preview = summaryText.substring(0, 100) || 'Summary generated';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Summarization"
      icon="📝"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {wordCount && (
          <div className="detail-row">
            <span className="label">Length:</span>
            <span className="value">{wordCount} words</span>
          </div>
        )}

        {topicList.length > 0 && (
          <div className="topics-section">
            <h4>Main Topics</h4>
            <div className="topic-chips">
              {topicList.map((topic: string, index: number) => (
                <span key={index} className="chip chip-topic">{topic}</span>
              ))}
            </div>
          </div>
        )}

        {summaryText && (
          <div className="summary-section">
            <h4>Summary</h4>
            <p className="text-content summary-text">{summaryText}</p>
          </div>
        )}

        {keyPointList.length > 0 && (
          <div className="key-points-section">
            <h4>Key Points</h4>
            <ul className="key-points-list">
              {keyPointList.map((point: string, index: number) => (
                <li key={index} className="key-point">{point}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
