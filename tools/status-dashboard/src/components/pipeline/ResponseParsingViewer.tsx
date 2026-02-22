import React, { useMemo } from 'react';
import type { ParsedResponse } from '../../types/prompt';
import { DispatchFlowDiagram } from './DispatchFlowDiagram';

interface ResponseParsingViewerProps {
  rawText: string;
  parsed: ParsedResponse;
}

interface ExtractedFlags {
  feelHeardCheck: string | null;
  readyShare: string | null;
  mode: string | null;
  intensity: string | null;
}

function extractFlags(thinking: string | null): ExtractedFlags {
  if (!thinking) return { feelHeardCheck: null, readyShare: null, mode: null, intensity: null };

  const fhc = thinking.match(/FeelHeardCheck[:\s]*(\w+)/i);
  const rs = thinking.match(/ReadyShare[:\s]*(\w+)/i);
  const mode = thinking.match(/[Mm]ode[:\s]*(\w+)/);
  const intensity = thinking.match(/[Ii]ntensity[:\s]*(\w+)/);

  return {
    feelHeardCheck: fhc?.[1] ?? null,
    readyShare: rs?.[1] ?? null,
    mode: mode?.[1] ?? null,
    intensity: intensity?.[1] ?? null,
  };
}

/**
 * Syntax-highlight the raw response text by coloring tags.
 */
function highlightRaw(text: string): React.JSX.Element[] {
  const parts: React.JSX.Element[] = [];
  let key = 0;

  const tagPatterns = [
    { regex: /(<thinking>)([\s\S]*?)(<\/thinking>)/i, cls: 'parsing-tag-thinking' },
    { regex: /(<draft>)([\s\S]*?)(<\/draft>)/i, cls: 'parsing-tag-draft' },
    { regex: /(<dispatch>)([\s\S]*?)(<\/dispatch>)/i, cls: 'parsing-tag-dispatch' },
  ];

  // Find all tag matches and sort by position
  const matches: Array<{ start: number; end: number; cls: string; text: string }> = [];
  for (const { regex, cls } of tagPatterns) {
    const m = text.match(regex);
    if (m && m.index !== undefined) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        cls,
        text: m[0],
      });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  let pos = 0;
  for (const match of matches) {
    if (match.start > pos) {
      parts.push(
        <span key={key++} className="parsing-tag-content">
          {text.slice(pos, match.start)}
        </span>
      );
    }
    parts.push(
      <span key={key++} className={match.cls}>{match.text}</span>
    );
    pos = match.end;
  }

  if (pos < text.length) {
    parts.push(
      <span key={key++} className="parsing-tag-content">{text.slice(pos)}</span>
    );
  }

  return parts;
}

export function ResponseParsingViewer({ rawText, parsed }: ResponseParsingViewerProps) {
  const flags = useMemo(() => extractFlags(parsed.thinking), [parsed.thinking]);
  const highlighted = useMemo(() => highlightRaw(rawText), [rawText]);

  const cleanResponse = rawText
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<draft>[\s\S]*?<\/draft>/gi, '')
    .replace(/<dispatch>[\s\S]*?<\/dispatch>/gi, '')
    .trim();

  return (
    <div>
      {/* Flag pills */}
      <div className="parsing-flags">
        <span className={`parsing-flag-pill ${flags.feelHeardCheck?.toUpperCase() === 'Y' ? 'active' : ''}`}>
          FHC: {flags.feelHeardCheck || 'N'}
        </span>
        <span className={`parsing-flag-pill ${flags.readyShare?.toUpperCase() === 'Y' ? 'active' : ''}`}>
          RS: {flags.readyShare || 'N'}
        </span>
        {flags.mode && (
          <span className="parsing-flag-pill">Mode: {flags.mode}</span>
        )}
        {flags.intensity && (
          <span className="parsing-flag-pill">Intensity: {flags.intensity}</span>
        )}
      </div>

      {/* Side-by-side panels */}
      <div className="response-parsing-viewer">
        {/* Left: Raw with syntax highlighting */}
        <div className="parsing-raw-panel">
          <div className="parsing-panel-title">Raw Response</div>
          <div className="parsing-raw-content">{highlighted}</div>
        </div>

        {/* Right: Parsed sections */}
        <div className="parsing-parsed-panel">
          <div className="parsing-panel-title">Parsed Sections</div>

          {parsed.thinking && (
            <div className="parsing-section">
              <div className="parsing-section-header">
                <span className="parsing-section-badge thinking">Thinking</span>
              </div>
              <div className="parsing-section-content">{parsed.thinking}</div>
            </div>
          )}

          {parsed.draft && (
            <div className="parsing-section">
              <div className="parsing-section-header">
                <span className="parsing-section-badge draft">Draft</span>
              </div>
              <div className="parsing-section-content">{parsed.draft}</div>
            </div>
          )}

          {parsed.dispatch && (
            <div className="parsing-section">
              <div className="parsing-section-header">
                <span className="parsing-section-badge dispatch">Dispatch</span>
              </div>
              <div className="parsing-section-content">{parsed.dispatch}</div>
              <DispatchFlowDiagram dispatchTag={parsed.dispatch} />
            </div>
          )}

          <div className="parsing-section">
            <div className="parsing-section-header">
              <span className="parsing-section-badge response">Response</span>
            </div>
            <div className="parsing-section-content">
              {cleanResponse || '(empty)'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
