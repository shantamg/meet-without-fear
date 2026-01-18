/**
 * MemoryFormattingEvent
 *
 * Displays formatted memory output.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function MemoryFormattingEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const formattedOutput = structured.formatted || structured.output || structured.formattedMemory || activity.output;
  const format = structured.format || structured.outputFormat;
  const sections = structured.sections || structured.memorySections || [];

  const sectionList = Array.isArray(sections) ? sections : [];

  const outputText = typeof formattedOutput === 'string' ? formattedOutput : '';
  const preview = format
    ? `Format: ${format}`
    : outputText.substring(0, 100) || 'Memory formatted';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Memory Formatting"
      icon="📄"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {format && (
          <div className="detail-row">
            <span className="label">Output Format:</span>
            <span className="value chip">{format}</span>
          </div>
        )}

        {sectionList.length > 0 && (
          <div className="sections-overview">
            <h4>Sections</h4>
            <div className="section-chips">
              {sectionList.map((section: any, index: number) => (
                <span key={index} className="chip chip-section">
                  {typeof section === 'string' ? section : section.name || section.title || `Section ${index + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {outputText && (
          <div className="formatted-output-section">
            <h4>Formatted Output</h4>
            <pre className="formatted-output">{outputText}</pre>
          </div>
        )}

        {!outputText && typeof formattedOutput === 'object' && formattedOutput !== null && (
          <div className="formatted-output-section">
            <h4>Formatted Output</h4>
            <pre className="formatted-output">{JSON.stringify(formattedOutput, null, 2)}</pre>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
