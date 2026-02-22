import { useState } from 'react';
import { CacheIndicator } from '../metrics/CacheIndicator';
import type { SystemPromptBlock, TokenBreakdown } from '../../types/prompt';

interface RequestPanelProps {
  systemPrompt: SystemPromptBlock[];
  messages: { role: string; content: string }[];
  tokens: TokenBreakdown;
}

const MAX_SYSTEM_LINES = 30;
const MAX_EARLIER_MESSAGES = 3;

export function RequestPanel({ systemPrompt, messages, tokens }: RequestPanelProps) {
  return (
    <div className="prompt-panel request-panel">
      <h3 className="panel-title">Request</h3>

      {/* System Prompt Blocks */}
      {systemPrompt.length > 0 && (
        <div className="prompt-section">
          <div className="prompt-section-header">
            <span className="prompt-section-label">System Prompt</span>
            <span className="prompt-token-count">{tokens.cacheRead + tokens.cacheWrite > 0 ? tokens.cacheRead.toLocaleString() : tokens.input.toLocaleString()} tokens</span>
          </div>
          {systemPrompt.map((block, i) => (
            <SystemBlock key={i} block={block} />
          ))}
        </div>
      )}

      {/* Messages Array */}
      <div className="prompt-section">
        <div className="prompt-section-header">
          <span className="prompt-section-label">Messages ({messages.length})</span>
        </div>
        <MessagesList messages={messages} />
      </div>
    </div>
  );
}

function SystemBlock({ block }: { block: SystemPromptBlock }) {
  const [expanded, setExpanded] = useState(false);
  const lines = block.content.split('\n');
  const needsTruncation = lines.length > MAX_SYSTEM_LINES;
  const displayContent = needsTruncation && !expanded
    ? lines.slice(0, MAX_SYSTEM_LINES).join('\n') + '\n...'
    : block.content;

  return (
    <div className="system-block">
      <div className="system-block-header">
        <span className="system-block-label">{block.label}</span>
        <CacheIndicator cached={block.cached} />
        <span className="system-block-tokens">{block.tokenCount.toLocaleString()} tok</span>
      </div>
      <pre className="system-block-content">{displayContent}</pre>
      {needsTruncation && (
        <button className="prompt-expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show full (${lines.length} lines)`}
        </button>
      )}
    </div>
  );
}

function MessagesList({ messages }: { messages: { role: string; content: string }[] }) {
  const [showAll, setShowAll] = useState(false);
  const hiddenCount = messages.length - MAX_EARLIER_MESSAGES;
  const visibleMessages = showAll ? messages : messages.slice(-MAX_EARLIER_MESSAGES);

  return (
    <div className="prompt-messages">
      {!showAll && hiddenCount > 0 && (
        <button className="prompt-expand-btn earlier-btn" onClick={() => setShowAll(true)}>
          Show {hiddenCount} earlier messages
        </button>
      )}
      {visibleMessages.map((msg, i) => (
        <div key={i} className={`prompt-message role-${msg.role}`}>
          <span className={`prompt-role-badge ${msg.role}`}>{msg.role}</span>
          <div className="prompt-message-content">{msg.content}</div>
        </div>
      ))}
      {showAll && hiddenCount > 0 && (
        <button className="prompt-expand-btn" onClick={() => setShowAll(false)}>
          Collapse earlier messages
        </button>
      )}
    </div>
  );
}
