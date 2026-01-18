/**
 * GenericActivityEvent
 *
 * Fallback component for unknown or untyped BrainActivity call types.
 * Displays basic information with raw data blocks.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function GenericActivityEvent({ activity, defaultExpanded }: Props) {
  const preview = typeof activity.output === 'string'
    ? activity.output.substring(0, 100)
    : JSON.stringify(activity.output)?.substring(0, 100);

  return (
    <BaseEventWrapper
      activity={activity}
      title={activity.callType || activity.activityType}
      icon="🔹"
      defaultExpanded={defaultExpanded}
      preview={preview}
    />
  );
}
