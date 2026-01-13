import React, { useState, useMemo } from 'react';
import { deepParse } from '../../utils/dataParsing';

interface SmartDataViewerProps {
  data: any;
  title?: string;
  defaultOpen?: boolean;
  maxDepth?: number;
}

/**
 * Unified component for displaying any JSON data in a consistent, pretty way.
 * Automatically detects patterns and renders them appropriately.
 */
export function SmartDataViewer({ data, title, defaultOpen = false, maxDepth = 6 }: SmartDataViewerProps) {
  const cleanData = useMemo(() => deepParse(data), [data]);

  if (cleanData === null || cleanData === undefined) return null;
  if (typeof cleanData === 'object' && Object.keys(cleanData).length === 0) return null;
  if (Array.isArray(cleanData) && cleanData.length === 0) return null;

  if (title) {
    return (
      <details className="smart-viewer-section" open={defaultOpen}>
        <summary className="smart-viewer-header">
          <h4>{title}</h4>
          <span className="data-type-badge">{getTypeLabel(cleanData)}</span>
        </summary>
        <div className="smart-viewer-content">
          <DataNode data={cleanData} depth={0} maxDepth={maxDepth} />
        </div>
      </details>
    );
  }

  return (
    <div className="smart-viewer-content">
      <DataNode data={cleanData} depth={0} maxDepth={maxDepth} />
    </div>
  );
}

function getTypeLabel(data: any): string {
  if (Array.isArray(data)) return `array[${data.length}]`;
  if (data === null) return 'null';
  if (typeof data === 'object') return `object{${Object.keys(data).length}}`;
  return typeof data;
}

interface DataNodeProps {
  data: any;
  depth: number;
  maxDepth: number;
  keyName?: string;
}

function DataNode({ data, depth, maxDepth, keyName }: DataNodeProps) {
  // Detect special patterns first
  const pattern = detectPattern(data);

  if (pattern === 'messages') {
    return <MessagesView messages={data.messages || data} keyName={keyName} />;
  }

  if (pattern === 'retrieval-matches') {
    return <MatchesView matches={data.topMatches || data} keyName={keyName} />;
  }

  if (pattern === 'search-queries') {
    return <QueriesView queries={data.searchQueries || data} keyName={keyName} />;
  }

  // Basic type rendering
  if (data === null) return <PrimitiveValue value="null" type="null" keyName={keyName} />;
  if (data === undefined) return <PrimitiveValue value="undefined" type="undefined" keyName={keyName} />;
  if (typeof data === 'boolean') return <PrimitiveValue value={String(data)} type="boolean" keyName={keyName} />;
  if (typeof data === 'number') return <PrimitiveValue value={String(data)} type="number" keyName={keyName} />;
  if (typeof data === 'string') return <StringValue value={data} keyName={keyName} />;

  // Arrays
  if (Array.isArray(data)) {
    return <ArrayView data={data} depth={depth} maxDepth={maxDepth} keyName={keyName} />;
  }

  // Objects
  if (typeof data === 'object') {
    return <ObjectView data={data} depth={depth} maxDepth={maxDepth} keyName={keyName} />;
  }

  return <PrimitiveValue value={String(data)} type="unknown" keyName={keyName} />;
}

type DataPattern = 'messages' | 'retrieval-matches' | 'search-queries' | 'generic';

function detectPattern(data: any): DataPattern {
  if (!data || typeof data !== 'object') return 'generic';

  // Chat messages pattern
  if (Array.isArray(data) && data.length > 0 && data[0]?.role && data[0]?.content !== undefined) {
    return 'messages';
  }
  if (data.messages && Array.isArray(data.messages) && data.messages.length > 0 && data.messages[0]?.role) {
    return 'messages';
  }

  // Retrieval matches pattern
  if (Array.isArray(data) && data.length > 0 && data[0]?.score !== undefined) {
    return 'retrieval-matches';
  }
  if (data.topMatches && Array.isArray(data.topMatches)) {
    return 'retrieval-matches';
  }

  // Search queries pattern
  if (data.searchQueries && Array.isArray(data.searchQueries)) {
    return 'search-queries';
  }

  return 'generic';
}

// Specialized renderers for common patterns

interface Message {
  role?: string;
  content: any;
}

/**
 * Clean up user message content by removing injected context
 */
function cleanMessageContent(content: string, role?: string): { main: string; context: string | null } {
  if (role?.toLowerCase() !== 'user' || typeof content !== 'string') {
    return { main: content, context: null };
  }

  // Detect context injection patterns like [Context for this turn: ... ]
  const contextMatch = content.match(/^\[([^\]]*(?:RECENT CONVERSATION|EMOTIONAL STATE|Context)[^\]]*)\]\s*/s);
  if (contextMatch) {
    const context = contextMatch[1].trim();
    const main = content.slice(contextMatch[0].length).trim();
    return { main: main || '(empty message)', context };
  }

  // Detect <system_context>...</system_context> or similar tags
  const tagMatch = content.match(/^<(\w+)>([\s\S]*?)<\/\1>\s*/);
  if (tagMatch) {
    const context = tagMatch[2].trim();
    const main = content.slice(tagMatch[0].length).trim();
    return { main: main || '(empty message)', context };
  }

  return { main: content, context: null };
}

function MessagesView({ messages, keyName }: { messages: any; keyName?: string }) {
  const msgs: Message[] = Array.isArray(messages) ? messages : (messages?.messages || []);

  return (
    <div className="sv-messages">
      {keyName && <span className="sv-key">{keyName}:</span>}
      <div className="sv-messages-list">
        {msgs.map((msg: Message, i: number) => {
          const { main, context } = typeof msg.content === 'string'
            ? cleanMessageContent(msg.content, msg.role)
            : { main: msg.content, context: null };

          return (
            <div key={i} className={`sv-message sv-message-${msg.role?.toLowerCase() || 'unknown'}`}>
              <span className="sv-message-role">{msg.role}</span>
              <div className="sv-message-content">
                {typeof main === 'string' ? main : <DataNode data={main} depth={0} maxDepth={4} />}
              </div>
              {context && (
                <details className="sv-message-context">
                  <summary>Injected context</summary>
                  <pre>{context}</pre>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchesView({ matches, keyName }: { matches: any[]; keyName?: string }) {
  return (
    <div className="sv-matches">
      {keyName && <span className="sv-key">{keyName}:</span>}
      <div className="sv-matches-list">
        {matches.map((match, i) => (
          <div key={i} className="sv-match">
            <div className="sv-match-header">
              {match.score !== undefined && match.score > 0 && (
                <span className="sv-match-score">{((match.score || 0) * 100).toFixed(0)}%</span>
              )}
              {match.source && <span className="sv-match-source">{match.source}</span>}
            </div>
            <div className="sv-match-content">{match.content || match.text || JSON.stringify(match)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueriesView({ queries, keyName }: { queries: string[]; keyName?: string }) {
  return (
    <div className="sv-queries">
      {keyName && <span className="sv-key">{keyName}:</span>}
      <ul className="sv-queries-list">
        {queries.map((q, i) => (
          <li key={i} className="sv-query">{q}</li>
        ))}
      </ul>
    </div>
  );
}

// Generic renderers

function PrimitiveValue({ value, type, keyName }: { value: string; type: string; keyName?: string }) {
  return (
    <span className="sv-primitive">
      {keyName && <span className="sv-key">{keyName}: </span>}
      <span className={`sv-value sv-${type}`}>{value}</span>
    </span>
  );
}

function StringValue({ value, keyName }: { value: string; keyName?: string }) {
  const isLong = value.length > 100;
  const isMultiline = value.includes('\n');
  const [expanded, setExpanded] = useState(false);

  // Check if it looks like a response/text field
  const isTextContent = keyName === 'response' || keyName === 'text' || keyName === 'content' || keyName === 'analysis';

  if (isTextContent || isMultiline || isLong) {
    return (
      <div className="sv-string-block">
        {keyName && <span className="sv-key">{keyName}:</span>}
        <div className={`sv-text-content ${isTextContent ? 'sv-text-highlight' : ''}`}>
          {(expanded || value.length <= 500) ? value : value.slice(0, 500) + '...'}
          {value.length > 500 && (
            <button className="sv-expand-btn" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : `Show all (${value.length} chars)`}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <span className="sv-primitive">
      {keyName && <span className="sv-key">{keyName}: </span>}
      <span className="sv-value sv-string">"{value}"</span>
    </span>
  );
}

function ArrayView({ data, depth, maxDepth, keyName }: { data: any[]; depth: number; maxDepth: number; keyName?: string }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (data.length === 0) {
    return (
      <span className="sv-primitive">
        {keyName && <span className="sv-key">{keyName}: </span>}
        <span className="sv-value sv-empty">[]</span>
      </span>
    );
  }

  // For small primitive arrays, render inline
  if (data.length <= 5 && data.every(item => typeof item !== 'object' || item === null)) {
    return (
      <span className="sv-primitive">
        {keyName && <span className="sv-key">{keyName}: </span>}
        <span className="sv-value sv-array-inline">
          [{data.map((item, i) => (
            <span key={i}>
              {i > 0 && ', '}
              {item === null ? 'null' : typeof item === 'string' ? `"${item}"` : String(item)}
            </span>
          ))}]
        </span>
      </span>
    );
  }

  if (depth >= maxDepth) {
    return (
      <span className="sv-primitive">
        {keyName && <span className="sv-key">{keyName}: </span>}
        <span className="sv-value sv-truncated">Array[{data.length}]</span>
      </span>
    );
  }

  return (
    <div className="sv-array">
      <div className="sv-array-header" onClick={() => setExpanded(!expanded)}>
        <span className="sv-toggle">{expanded ? '▼' : '▶'}</span>
        {keyName && <span className="sv-key">{keyName}: </span>}
        <span className="sv-type-label">Array[{data.length}]</span>
      </div>
      {expanded && (
        <div className="sv-array-items">
          {data.map((item, index) => (
            <div key={index} className="sv-array-item">
              <span className="sv-index">{index}:</span>
              <DataNode data={item} depth={depth + 1} maxDepth={maxDepth} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectView({ data, depth, maxDepth, keyName }: { data: object; depth: number; maxDepth: number; keyName?: string }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const keys = Object.keys(data);

  if (keys.length === 0) {
    return (
      <span className="sv-primitive">
        {keyName && <span className="sv-key">{keyName}: </span>}
        <span className="sv-value sv-empty">{'{}'}</span>
      </span>
    );
  }

  if (depth >= maxDepth) {
    return (
      <span className="sv-primitive">
        {keyName && <span className="sv-key">{keyName}: </span>}
        <span className="sv-value sv-truncated">Object{'{...}'}</span>
      </span>
    );
  }

  // Sort keys: metadata first, then alphabetically, response-like fields last
  const firstKeys = ['id', 'type', 'status', 'name', 'operation', 'model'];
  const lastKeys = ['analysis', 'content', 'text', 'response']; // User-facing content at the end

  const sortedKeys = [...keys].sort((a, b) => {
    const aFirstIdx = firstKeys.indexOf(a);
    const bFirstIdx = firstKeys.indexOf(b);
    const aLastIdx = lastKeys.indexOf(a);
    const bLastIdx = lastKeys.indexOf(b);

    // First priority keys come first
    if (aFirstIdx !== -1 && bFirstIdx !== -1) return aFirstIdx - bFirstIdx;
    if (aFirstIdx !== -1) return -1;
    if (bFirstIdx !== -1) return 1;

    // Last priority keys come last  
    if (aLastIdx !== -1 && bLastIdx !== -1) return aLastIdx - bLastIdx;
    if (aLastIdx !== -1) return 1;
    if (bLastIdx !== -1) return -1;

    // Everything else alphabetically
    return a.localeCompare(b);
  });

  return (
    <div className="sv-object">
      <div className="sv-object-header" onClick={() => setExpanded(!expanded)}>
        <span className="sv-toggle">{expanded ? '▼' : '▶'}</span>
        {keyName && <span className="sv-key">{keyName}: </span>}
        <span className="sv-type-label">Object{`{${keys.length}}`}</span>
        {!expanded && keys.length <= 3 && (
          <span className="sv-preview">
            {' {'}{keys.slice(0, 3).join(', ')}{keys.length > 3 ? ', ...' : ''}{'}'}
          </span>
        )}
      </div>
      {expanded && (
        <div className="sv-object-entries">
          {sortedKeys.map(key => (
            <div key={key} className="sv-entry">
              <DataNode
                data={(data as any)[key]}
                depth={depth + 1}
                maxDepth={maxDepth}
                keyName={key}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
