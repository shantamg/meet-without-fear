/**
 * PeopleExtractionEvent
 *
 * Displays extracted people/entities from the conversation.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function PeopleExtractionEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const people = structured.people || structured.extractedPeople || structured.entities || [];

  const peopleList = Array.isArray(people) ? people : [];
  const preview = peopleList.length > 0
    ? `${peopleList.length} ${peopleList.length === 1 ? 'person' : 'people'} extracted`
    : 'No people extracted';

  return (
    <BaseEventWrapper
      activity={activity}
      title="People Extraction"
      icon="👥"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        {peopleList.length > 0 ? (
          <div className="people-list">
            <h4>Extracted People</h4>
            <div className="people-grid">
              {peopleList.map((person: any, index: number) => (
                <div key={index} className="person-card">
                  {typeof person === 'string' ? (
                    <span className="person-name">{person}</span>
                  ) : (
                    <>
                      <span className="person-name">{person.name || person.value || `Person ${index + 1}`}</span>
                      {person.relationship && (
                        <span className="person-relationship chip">{person.relationship}</span>
                      )}
                      {person.role && (
                        <span className="person-role">{person.role}</span>
                      )}
                      {person.context && (
                        <span className="person-context">{person.context}</span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="no-results">
            <p>No people were extracted from this conversation segment.</p>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
