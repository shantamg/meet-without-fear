/**
 * MemoryValidationEvent
 *
 * Displays memory validation results.
 */
import React from 'react';
import { BrainActivity } from '../../types';
import { BaseEventWrapper } from './BaseEventWrapper';

interface Props {
  activity: BrainActivity;
  defaultExpanded?: boolean;
}

export function MemoryValidationEvent({ activity, defaultExpanded }: Props) {
  const structured = activity.structuredOutput || {};
  const isValid = structured.isValid ?? structured.valid ?? structured.validated;
  const validationResult = structured.result || structured.validationResult;
  const errors = structured.errors || structured.validationErrors || [];
  const warnings = structured.warnings || [];
  const confidence = structured.confidence;

  const errorList = Array.isArray(errors) ? errors : [];
  const warningList = Array.isArray(warnings) ? warnings : [];

  const preview = isValid !== undefined
    ? isValid
      ? 'Valid'
      : `Invalid (${errorList.length} error${errorList.length !== 1 ? 's' : ''})`
    : validationResult || 'Validation complete';

  return (
    <BaseEventWrapper
      activity={activity}
      title="Memory Validation"
      icon="✅"
      defaultExpanded={defaultExpanded}
      preview={preview}
    >
      <div className="event-content">
        <div className="detail-row">
          <span className="label">Validation Result:</span>
          <span className={`value chip ${isValid ? 'chip-success' : 'chip-error'}`}>
            {isValid ? '✓ Valid' : '✗ Invalid'}
          </span>
          {confidence !== undefined && (
            <span className="confidence-badge">{(confidence * 100).toFixed(0)}%</span>
          )}
        </div>

        {validationResult && typeof validationResult === 'string' && (
          <div className="result-section">
            <h4>Result</h4>
            <p className="text-content">{validationResult}</p>
          </div>
        )}

        {errorList.length > 0 && (
          <div className="errors-section">
            <h4>Errors</h4>
            <ul className="error-list">
              {errorList.map((error: any, index: number) => (
                <li key={index} className="error-item">
                  {typeof error === 'string' ? error : error.message || JSON.stringify(error)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {warningList.length > 0 && (
          <div className="warnings-section">
            <h4>Warnings</h4>
            <ul className="warning-list">
              {warningList.map((warning: any, index: number) => (
                <li key={index} className="warning-item">
                  {typeof warning === 'string' ? warning : warning.message || JSON.stringify(warning)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BaseEventWrapper>
  );
}
