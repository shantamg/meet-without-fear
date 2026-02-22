import { useState } from 'react';
import type { ParsedResponse } from '../../types/prompt';

interface ResponsePanelProps {
  response: ParsedResponse;
}

interface ParsedThinking {
  mode?: string;
  intensity?: string;
  strategy?: string;
  feelHeardCheck?: string;
  readyShare?: string;
  raw: string;
}

function parseThinkingFields(raw: string): ParsedThinking {
  const result: ParsedThinking = { raw };

  const modeMatch = raw.match(/mode[:\s]*(\w+)/i);
  if (modeMatch) result.mode = modeMatch[1];

  const intensityMatch = raw.match(/intensity[:\s]*(\w+)/i);
  if (intensityMatch) result.intensity = intensityMatch[1];

  const strategyMatch = raw.match(/strategy[:\s]*(.+?)(?:\n|$)/i);
  if (strategyMatch) result.strategy = strategyMatch[1].trim();

  const fhcMatch = raw.match(/FeelHeardCheck[:\s]*(\w+)/i);
  if (fhcMatch) result.feelHeardCheck = fhcMatch[1];

  const rsMatch = raw.match(/ReadyShare[:\s]*(\w+)/i);
  if (rsMatch) result.readyShare = rsMatch[1];

  return result;
}

function getCleanResponse(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<draft>[\s\S]*?<\/draft>/g, '')
    .replace(/<dispatch[^>]*>[\s\S]*?<\/dispatch>/g, '')
    .replace(/<\w+_dispatch[^>]*\/>/g, '')
    .trim();
}

export function ResponsePanel({ response }: ResponsePanelProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  // Use pre-parsed fields from the backend
  const thinking = response.thinking ? parseThinkingFields(response.thinking) : null;
  const draft = response.draft;
  const dispatch = response.dispatch;
  const cleanResponse = getCleanResponse(response.text);

  return (
    <div className="prompt-panel response-panel">
      <h3 className="panel-title">Response</h3>

      {/* Thinking Block */}
      {thinking && (
        <div className="response-card thinking-card">
          <div
            className="response-card-header"
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
          >
            <span className="response-card-icon">🧠</span>
            <span className="response-card-title">Thinking</span>
            <div className="thinking-badges">
              {thinking.mode && <span className="thinking-badge">{thinking.mode}</span>}
              {thinking.intensity && <span className="thinking-badge">{thinking.intensity}</span>}
              {thinking.feelHeardCheck && (
                <span className={`thinking-badge ${thinking.feelHeardCheck.toLowerCase() === 'true' ? 'success' : ''}`}>
                  FHC: {thinking.feelHeardCheck}
                </span>
              )}
              {thinking.readyShare && (
                <span className={`thinking-badge ${thinking.readyShare.toLowerCase() === 'true' ? 'success' : ''}`}>
                  RS: {thinking.readyShare}
                </span>
              )}
            </div>
            <span className="response-card-toggle">{thinkingExpanded ? '▼' : '▶'}</span>
          </div>
          {thinkingExpanded && (
            <div className="response-card-body">
              {thinking.strategy && (
                <div className="thinking-strategy">
                  <span className="thinking-label">Strategy:</span> {thinking.strategy}
                </div>
              )}
              <pre className="thinking-raw">{thinking.raw}</pre>
            </div>
          )}
        </div>
      )}

      {/* Draft Block */}
      {draft && (
        <div className="response-card draft-card">
          <div className="response-card-header">
            <span className="response-card-icon">📝</span>
            <span className="response-card-title">Draft</span>
          </div>
          <div className="response-card-body">
            <p className="draft-text">{draft}</p>
          </div>
        </div>
      )}

      {/* Dispatch Block */}
      {dispatch && (
        <div className="response-card dispatch-card">
          <div className="response-card-header">
            <span className="response-card-icon">⚡</span>
            <span className="response-card-title">Dispatch</span>
            <span className="dispatch-tag">{dispatch}</span>
          </div>
        </div>
      )}

      {/* Response Text */}
      <div className="response-text-section">
        <div className="response-text-label">Response</div>
        <div className="response-text-content">
          {cleanResponse || <span className="text-muted">(empty response)</span>}
        </div>
      </div>

      {/* Raw JSON Toggle */}
      <button className="prompt-expand-btn raw-toggle" onClick={() => setShowRaw(!showRaw)}>
        {showRaw ? 'Hide Raw JSON' : 'Show Raw JSON'}
      </button>
      {showRaw && (
        <pre className="raw-json">{JSON.stringify(response, null, 2)}</pre>
      )}
    </div>
  );
}
