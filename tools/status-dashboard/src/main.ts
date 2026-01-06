import Ably from 'ably';
import './style.css';

const ablyKey = import.meta.env.VITE_ABLY_KEY;
if (!ablyKey) throw new Error('VITE_ABLY_KEY missing');

const client = new Ably.Realtime(ablyKey);
const channel = client.channels.get('ai-audit-stream');

// --- State ---
let sessionCost = 0.0000;
let messageCount = 0;
const turnContainers = new Map<string, HTMLElement>();
const turnMetadata = new Map<string, { timestamp: string; userInput?: string; sessionId?: string; turnCount?: number }>();

// --- DOM Elements ---
const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="dashboard-header">
    <div class="brand">
      <span class="pulse-dot" id="status-dot"></span>
      <h1>Neural Monitor</h1>
    </div>
    <div class="metrics">
      <div class="metric">
        <span class="label">Session Cost</span>
        <span class="value" id="cost-display">$0.0000</span>
      </div>
      <div class="metric">
        <span class="label">Events</span>
        <span class="value" id="count-display">0</span>
      </div>
    </div>
  </div>
  <div id="feed" class="feed-container"></div>
`;

const feed = document.getElementById('feed')!;
const costDisplay = document.getElementById('cost-display')!;
const countDisplay = document.getElementById('count-display')!;
const statusDot = document.getElementById('status-dot')!;

// --- Helpers ---
function formatCurrency(num: number) {
  return '$' + num.toFixed(4);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function parseJsonSafely(text: string): any {
  try {
    // Try to extract JSON from text if it's wrapped
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function renderJsonVisual(obj: any, depth = 0): string {
  if (depth > 3) return escapeHtml(JSON.stringify(obj));
  
  if (obj === null) return '<span class="json-null">null</span>';
  if (obj === undefined) return '<span class="json-undefined">undefined</span>';
  if (typeof obj === 'string') return `<span class="json-string">"${escapeHtml(obj)}"</span>`;
  if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
  if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span class="json-empty">[]</span>';
    return `<div class="json-array">[<div class="json-indent">${obj.map((item, i) => 
      `<div class="json-item"><span class="json-key">${i}:</span> ${renderJsonVisual(item, depth + 1)}</div>`
    ).join('')}</div>]</div>`;
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '<span class="json-empty">{}</span>';
    return `<div class="json-object">{<div class="json-indent">${keys.map(key => 
      `<div class="json-item"><span class="json-key">"${escapeHtml(key)}":</span> ${renderJsonVisual(obj[key], depth + 1)}</div>`
    ).join('')}</div>}</div>`;
  }
  
  return escapeHtml(String(obj));
}

function createExpandableSection(title: string, content: string, defaultExpanded = false, explanation?: string): string {
  const id = `expand-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return `
    <div class="expandable-section">
      <button class="expand-toggle" data-target="${id}" aria-expanded="${defaultExpanded}">
        <span class="expand-icon">${defaultExpanded ? '▼' : '▶'}</span>
        <span class="expand-title">${escapeHtml(title)}</span>
        ${explanation ? `<span class="explanation-icon" title="${escapeHtml(explanation)}">ℹ️</span>` : ''}
      </button>
      <div class="expand-content" id="${id}" style="display: ${defaultExpanded ? 'block' : 'none'}">
        ${content}
      </div>
    </div>
  `;
}

function createCard(data: any) {
  const card = document.createElement('div');
  card.className = `log-card type-${data.section} collapsible-card`;
  
  const time = new Date(data.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
  const meta = data.data || {};
  const cardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  let summaryHtml = '';
  let contentHtml = '';
  
  if (data.section === 'USER') {
    const preview = meta.userMessage ? (meta.userMessage.length > 60 ? meta.userMessage.substring(0, 60) + '...' : meta.userMessage) : '';
    summaryHtml = `
      <div class="card-summary">
        <span class="summary-text">${escapeHtml(preview)}</span>
        <span class="summary-meta">${meta.messageLength || 0}ch • S${meta.stage || 'N/A'}</span>
      </div>
    `;
    contentHtml = `
      <div class="user-message-details">
        <div class="user-message-text">${escapeHtml(meta.userMessage || '')}</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Length:</span>
            <span class="info-value">${meta.messageLength || 0} chars</span>
          </div>
          <div class="info-item">
            <span class="info-label">Stage:</span>
            <span class="info-value">${meta.stage || 'N/A'}</span>
          </div>
          ${meta.isFirstTurnInSession ? `
            <div class="info-item">
              <span class="info-label">First Turn:</span>
              <span class="info-value">Yes</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  } else if (data.section === 'INTENT') {
    const intentExplanations: Record<string, string> = {
      'stage_enforcement': 'System is enforcing stage boundaries - minimal memory access',
      'emotional_validation': 'Focusing on emotional support with limited context',
      'recall_commitment': 'User referenced past agreement - full memory search needed',
      'avoid_recall': 'Critical distress detected - staying present without past triggers',
    };
    
    const depthExplanations: Record<string, string> = {
      'none': 'No memory retrieval',
      'minimal': 'Only current conversation',
      'full': 'Full semantic search across all sessions',
    };
    
    summaryHtml = `
      <div class="card-summary">
        <span class="summary-text">
          <span class="badge">${escapeHtml(meta.intent || 'N/A')}</span>
          <span class="summary-separator">•</span>
          <span>${escapeHtml(meta.depth || 'N/A')}</span>
        </span>
        ${meta.reason ? `<span class="summary-meta">${escapeHtml(meta.reason.substring(0, 40))}${meta.reason.length > 40 ? '...' : ''}</span>` : ''}
      </div>
    `;
    contentHtml = `
      <div class="intent-details">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Intent:</span>
            <span class="info-value badge">${escapeHtml(meta.intent || 'N/A')}</span>
            ${meta.intent && intentExplanations[meta.intent] ? `<span class="info-hint" title="${intentExplanations[meta.intent]}">ℹ️</span>` : ''}
          </div>
          <div class="info-item">
            <span class="info-label">Depth:</span>
            <span class="info-value">${escapeHtml(meta.depth || 'N/A')}</span>
            ${meta.depth && depthExplanations[meta.depth] ? `<span class="info-hint" title="${depthExplanations[meta.depth]}">ℹ️</span>` : ''}
          </div>
          ${meta.emotionalIntensity ? `
            <div class="info-item">
              <span class="info-label">Emotional Intensity:</span>
              <span class="info-value">${meta.emotionalIntensity}/10</span>
            </div>
          ` : ''}
        </div>
        ${meta.reason ? `<div class="reason-text">${escapeHtml(meta.reason)}</div>` : ''}
        ${meta.userInput ? `
          <div class="user-input-section">
            <div class="section-label">User Input:</div>
            <div class="user-input-text">${escapeHtml(meta.userInput)}</div>
          </div>
        ` : ''}
      </div>
    `;
  } else if (data.section === 'RETRIEVAL') {
    if (meta.searchQueries && meta.searchQueries.length > 0) {
      summaryHtml = `
        <div class="card-summary">
          <span class="summary-text">${meta.searchQueries.length} queries</span>
          ${meta.referencesDetected && meta.referencesDetected.length > 0 ? `
            <span class="summary-meta">• ${meta.referencesDetected.length} refs</span>
          ` : ''}
        </div>
      `;
      contentHtml = `
        <div class="retrieval-details">
          <div class="info-item">
            <span class="info-label">Search Queries Generated:</span>
            <span class="info-value">${meta.searchQueries.length}</span>
          </div>
          <ul class="query-list">
            ${meta.searchQueries.map((q: string, i: number) => 
              `<li><span class="query-number">${i + 1}.</span> ${escapeHtml(q)}</li>`
            ).join('')}
          </ul>
          ${meta.referencesDetected && meta.referencesDetected.length > 0 ? `
            <div class="references-section">
              <div class="section-label">References Detected:</div>
              <ul class="reference-list">
                ${meta.referencesDetected.map((r: any) => 
                  `<li>
                    <span class="ref-type ${r.type}">${r.type}</span>
                    <span class="ref-text">${escapeHtml(r.text)}</span>
                    <span class="confidence ${r.confidence}">${r.confidence}</span>
                  </li>`
                ).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `;
    } else if (meta.topMatches && meta.topMatches.length > 0) {
      summaryHtml = `
        <div class="card-summary">
          <span class="summary-text">
            ${meta.crossSessionResults || 0} cross • ${meta.withinSessionResults || 0} within
          </span>
          <span class="summary-meta">• ${meta.topMatches.length} snippets</span>
        </div>
      `;
      contentHtml = `
        <div class="retrieval-details">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Cross-Session Matches:</span>
              <span class="info-value">${meta.crossSessionResults || 0}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Within-Session Matches:</span>
              <span class="info-value">${meta.withinSessionResults || 0}</span>
            </div>
          </div>
          <div class="matches-section">
            <div class="section-label">Top Retrieved Snippets:</div>
            <div class="matches-list">
              ${meta.topMatches.map((m: any, i: number) => `
                <div class="match-item">
                  <div class="match-header">
                    <span class="match-number">#${i + 1}</span>
                    <span class="match-source ${m.source}">${m.source === 'cross-session' ? 'Other Session' : 'This Session'}</span>
                    <span class="match-similarity">${(parseFloat(m.similarity) * 100).toFixed(1)}% match</span>
                  </div>
                  <div class="match-content">${escapeHtml(m.content)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (meta.crossSessionSamples || meta.withinSessionSamples) {
      const crossCount = meta.crossSessionSamples?.length || 0;
      const withinCount = meta.withinSessionSamples?.length || 0;
      summaryHtml = `
        <div class="card-summary">
          <span class="summary-text">${escapeHtml((meta.summary || data.message).substring(0, 50))}${(meta.summary || data.message).length > 50 ? '...' : ''}</span>
          ${crossCount > 0 || withinCount > 0 ? `
            <span class="summary-meta">• ${crossCount} cross • ${withinCount} within</span>
          ` : ''}
        </div>
      `;
      const samples: string[] = [];
      
      if (meta.crossSessionSamples && meta.crossSessionSamples.length > 0) {
        samples.push(`
          <div class="samples-group">
            <div class="section-label">From Other Sessions:</div>
            ${meta.crossSessionSamples.map((m: any, i: number) => `
              <div class="sample-item">
                <div class="sample-header">
                  <span class="sample-number">#${i + 1}</span>
                  <span class="sample-similarity">${(parseFloat(m.similarity) * 100).toFixed(1)}% match</span>
                  ${m.timeContext ? `<span class="sample-time">${escapeHtml(m.timeContext)}</span>` : ''}
                </div>
                <div class="sample-content">${escapeHtml(m.content)}</div>
              </div>
            `).join('')}
          </div>
        `);
      }
      
      if (meta.withinSessionSamples && meta.withinSessionSamples.length > 0) {
        samples.push(`
          <div class="samples-group">
            <div class="section-label">From This Session:</div>
            ${meta.withinSessionSamples.map((m: any, i: number) => `
              <div class="sample-item">
                <div class="sample-header">
                  <span class="sample-number">#${i + 1}</span>
                  <span class="sample-similarity">${(parseFloat(m.similarity) * 100).toFixed(1)}% match</span>
                  ${m.timeContext ? `<span class="sample-time">${escapeHtml(m.timeContext)}</span>` : ''}
                </div>
                <div class="sample-content">${escapeHtml(m.content)}</div>
              </div>
            `).join('')}
          </div>
        `);
      }
      
      contentHtml = `
        <div class="retrieval-details">
          <div class="retrieval-summary">${escapeHtml(meta.summary || data.message)}</div>
          ${samples.join('')}
        </div>
      `;
    } else if (meta.queries && meta.queries.length > 0) {
      summaryHtml = `
        <div class="card-summary">
          <span class="summary-text">Plan: ${meta.queryCount} queries</span>
        </div>
      `;
      contentHtml = `
        <div class="retrieval-details">
          <div class="info-item">
            <span class="info-label">Retrieval Plan:</span>
            <span class="info-value">${meta.queryCount} queries</span>
          </div>
          <ul class="query-list">
            ${meta.queries.map((q: any, i: number) => `
              <li>
                <span class="query-number">${i + 1}.</span>
                <span class="query-text">${escapeHtml(q.query)}</span>
                <span class="query-meta">[${q.intent || 'N/A'}, Stage ${q.stage || 'N/A'}]</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    } else {
      summaryHtml = `<div class="card-summary"><span class="summary-text">${escapeHtml(meta.summary || data.message)}</span></div>`;
      contentHtml = `<div class="retrieval-summary">${escapeHtml(meta.summary || data.message)}</div>`;
    }
  } else if (data.section === 'PROMPT') {
    const promptKb = Math.round((meta.promptLength || 0) / 1000);
    const hasContext = !!(meta.fullContextBundle || meta.contextBundlePreview);
    const hasRetrieved = !!(meta.fullRetrievedContext || meta.retrievedContextPreview);
    
    summaryHtml = `
      <div class="card-summary">
        <span class="summary-text">${promptKb}k</span>
        ${meta.conversationHistoryCount !== undefined ? `
          <span class="summary-meta">• ${meta.conversationHistoryCount} msgs</span>
        ` : ''}
        ${meta.truncatedCount ? `
          <span class="summary-meta warning">• ${meta.truncatedCount} trunc</span>
        ` : ''}
        ${hasContext || hasRetrieved ? `
          <span class="summary-meta">• ctx</span>
        ` : ''}
      </div>
    `;
    
    const sections: string[] = [];
    
    if (meta.fullPrompt) {
      sections.push(createExpandableSection(
        'Full System Prompt',
        `<pre class="prompt-full">${escapeHtml(meta.fullPrompt)}</pre>`,
        false,
        'The complete system prompt that defines the AI\'s role and instructions'
      ));
    } else if (meta.promptPreview) {
      sections.push(createExpandableSection(
        'Prompt Preview',
        `<pre class="prompt-preview">${escapeHtml(meta.promptPreview)}</pre>`,
        false
      ));
    }
    
    if (meta.fullContextBundle) {
      sections.push(createExpandableSection(
        'Context Bundle (Inserted into Prompt)',
        `<pre class="context-text">${escapeHtml(meta.fullContextBundle)}</pre>`,
        false,
        'Stage-scoped context including conversation history, emotional state, and session summary'
      ));
    } else if (meta.contextBundlePreview) {
      sections.push(createExpandableSection(
        'Context Bundle Preview',
        `<pre class="context-text">${escapeHtml(meta.contextBundlePreview)}</pre>`,
        false
      ));
    }
    
    if (meta.fullRetrievedContext) {
      sections.push(createExpandableSection(
        'Retrieved Context (Inserted into Prompt)',
        `<pre class="context-text">${escapeHtml(meta.fullRetrievedContext)}</pre>`,
        false,
        'Semantically retrieved messages from other sessions or earlier in this session'
      ));
    } else if (meta.retrievedContextPreview) {
      sections.push(createExpandableSection(
        'Retrieved Context Preview',
        `<pre class="context-text">${escapeHtml(meta.retrievedContextPreview)}</pre>`,
        false
      ));
    }
    
    contentHtml = `
      <div class="prompt-details">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Prompt Length:</span>
            <span class="info-value">${meta.promptLength || 0} chars</span>
          </div>
          ${meta.turnCount ? `
            <div class="info-item">
              <span class="info-label">Turn:</span>
              <span class="info-value">${meta.turnCount}</span>
            </div>
          ` : ''}
          ${meta.conversationHistoryCount !== undefined ? `
            <div class="info-item">
              <span class="info-label">Messages Included:</span>
              <span class="info-value">${meta.conversationHistoryCount}</span>
            </div>
          ` : ''}
          ${meta.truncatedCount ? `
            <div class="info-item warning">
              <span class="info-label">Truncated:</span>
              <span class="info-value">${meta.truncatedCount} messages</span>
            </div>
          ` : ''}
          ${meta.cautionAdvised ? `
            <div class="info-item caution">
              <span class="info-label">⚠️ Caution Advised</span>
            </div>
          ` : ''}
        </div>
        ${sections.join('')}
      </div>
    `;
  } else if (data.section === 'COST') {
    const parsed = parseJsonSafely(data.message);
    const costValue = meta.totalCost || 0;
    const modelShort = meta.model ? meta.model.split('/').pop()?.split(':')[0] || meta.model : 'Unknown';
    
    summaryHtml = `
      <div class="card-summary">
        <span class="summary-text">
          <span class="money">${formatCurrency(costValue)}</span>
          <span class="summary-separator">•</span>
          <span>${modelShort}</span>
        </span>
        <span class="summary-meta">${meta.inputTokens || 0} in • ${meta.outputTokens || 0} out</span>
      </div>
    `;
    
    contentHtml = `
      <div class="cost-details">
        <div class="cost-explanation">
          <span class="explanation-icon" title="Each AI API call costs money based on tokens used. Input tokens are what you send, output tokens are what the AI generates.">ℹ️</span>
          <span class="explanation-text">Micro-transaction: A single API call cost</span>
        </div>
        <div class="cost-breakdown">
          <div class="cost-item">
            <span class="cost-label">Model:</span>
            <span class="cost-value model-name">${escapeHtml(meta.model || 'Unknown')}</span>
          </div>
          <div class="cost-item">
            <span class="cost-label">Input Tokens:</span>
            <span class="cost-value">${meta.inputTokens || 0}</span>
            <span class="cost-hint">(text sent to AI)</span>
          </div>
          <div class="cost-item">
            <span class="cost-label">Output Tokens:</span>
            <span class="cost-value">${meta.outputTokens || 0}</span>
            <span class="cost-hint">(text generated by AI)</span>
          </div>
          <div class="cost-item total">
            <span class="cost-label">Total Cost:</span>
            <span class="cost-value money">${formatCurrency(costValue)}</span>
          </div>
        </div>
      </div>
    `;
  } else if (data.section === 'RESPONSE') {
    const responseText = meta.responseText || meta.responsePreview || '';
    const parsedJson = responseText ? parseJsonSafely(responseText) : null;
    const responsePreview = responseText ? (responseText.length > 50 ? responseText.substring(0, 50) + '...' : responseText) : '';
    
    const flags: string[] = [];
    if (meta.offerFeelHeardCheck) flags.push('FH');
    if (meta.offerReadyToShare) flags.push('RTS');
    if (meta.hasInvitationMessage) flags.push('Inv');
    if (meta.hasEmpathyStatement) flags.push('Emp');
    
    summaryHtml = `
      <div class="card-summary">
        <span class="summary-text">${escapeHtml(responsePreview)}</span>
        <span class="summary-meta">
          ${meta.durationMs || meta.totalDuration || 'N/A'}ms
          ${meta.usedMock ? ' • Mock' : ''}
          ${flags.length > 0 ? ` • ${flags.join(',')}` : ''}
        </span>
      </div>
    `;
    
    const sections: string[] = [];
    
    if (parsedJson) {
      sections.push(createExpandableSection(
        'Structured Response (JSON)',
        `<div class="json-visual">${renderJsonVisual(parsedJson)}</div>`,
        false,
        'The AI response parsed as structured JSON'
      ));
      sections.push(createExpandableSection(
        'Raw Response Text',
        `<pre class="response-raw">${escapeHtml(responseText)}</pre>`,
        false
      ));
    } else if (responseText) {
      sections.push(createExpandableSection(
        'Full Response',
        `<div class="response-text">${escapeHtml(responseText)}</div>`,
        false
      ));
    }
    
    contentHtml = `
      <div class="response-details">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Duration:</span>
            <span class="info-value">${meta.durationMs || meta.totalDuration || 'N/A'}ms</span>
          </div>
          <div class="info-item">
            <span class="info-label">Status:</span>
            <span class="info-value">${meta.usedMock ? '⚠️ Mock' : '✅ Live'}</span>
          </div>
          ${meta.responseLength ? `
            <div class="info-item">
              <span class="info-label">Length:</span>
              <span class="info-value">${meta.responseLength} chars</span>
            </div>
          ` : ''}
        </div>
        ${sections.join('')}
        ${(meta.offerFeelHeardCheck !== undefined || meta.offerReadyToShare !== undefined || meta.hasInvitationMessage || meta.hasEmpathyStatement) ? `
          <div class="response-flags">
            ${meta.offerFeelHeardCheck ? '<span class="flag">Feel Heard Check</span>' : ''}
            ${meta.offerReadyToShare ? '<span class="flag">Ready to Share</span>' : ''}
            ${meta.hasInvitationMessage ? '<span class="flag">Has Invitation</span>' : ''}
            ${meta.hasEmpathyStatement ? '<span class="flag">Has Empathy Statement</span>' : ''}
          </div>
        ` : ''}
      </div>
    `;
  } else {
    const json = JSON.stringify(meta, null, 2);
    if (json !== '{}') {
      contentHtml = `<pre class="json-dump">${escapeHtml(json)}</pre>`;
    }
  }

  const bodyId = `${cardId}-body`;
  const hasContent = !!contentHtml;
  
  card.innerHTML = `
    <div class="card-header">
      <span class="section-tag">${data.section}</span>
      <span class="timestamp">${time}</span>
    </div>
    <div class="card-message">${data.message}</div>
    ${summaryHtml ? `<div class="card-summary-container">${summaryHtml}</div>` : ''}
    ${hasContent ? `
      <button class="card-expand-toggle" data-target="${bodyId}" aria-expanded="false">
        <span class="expand-icon">▶</span>
        <span class="expand-label">Show Details</span>
      </button>
      <div class="card-body" id="${bodyId}" style="display: none;">
        ${contentHtml}
      </div>
    ` : ''}
  `;
  
  // Attach card expand/collapse handler
  if (hasContent) {
    const expandBtn = card.querySelector('.card-expand-toggle')!;
    expandBtn.addEventListener('click', () => {
      const targetId = expandBtn.getAttribute('data-target')!;
      const content = card.querySelector(`#${targetId}`)!;
      const icon = expandBtn.querySelector('.expand-icon')!;
      const label = expandBtn.querySelector('.expand-label')!;
      const isExpanded = content.style.display !== 'none';
      
      content.style.display = isExpanded ? 'none' : 'block';
      icon.textContent = isExpanded ? '▶' : '▼';
      label.textContent = isExpanded ? 'Show Details' : 'Hide Details';
      expandBtn.setAttribute('aria-expanded', String(!isExpanded));
    });
  }
  
  // Attach nested expand handlers
  card.querySelectorAll('.expand-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target')!;
      const content = card.querySelector(`#${targetId}`)!;
      const icon = btn.querySelector('.expand-icon')!;
      const isExpanded = content.style.display !== 'none';
      
      content.style.display = isExpanded ? 'none' : 'block';
      icon.textContent = isExpanded ? '▶' : '▼';
      btn.setAttribute('aria-expanded', String(!isExpanded));
    });
  });

  return card;
}

// --- Turn Container Management ---
function getOrCreateTurnContainer(turnId: string | undefined, data: any): HTMLElement {
  const effectiveTurnId = turnId || `orphan-${Date.now()}`;
  
  if (!turnContainers.has(effectiveTurnId)) {
    const container = document.createElement('div');
    container.className = 'turn-container';
    container.dataset.turnId = effectiveTurnId;
    
    const meta = data.data || {};
    const userInput = meta.userInput || '';
    const sessionId = meta.sessionId || data.data?.sessionId || '';
    const turnCount = meta.turnCount || data.data?.turnCount;
    
    let displaySessionId = sessionId;
    let displayTurnCount = turnCount;
    if (effectiveTurnId.includes('-') && !effectiveTurnId.startsWith('orphan-')) {
      const parts = effectiveTurnId.split('-');
      if (parts.length >= 2) {
        displayTurnCount = parts[parts.length - 1];
        displaySessionId = parts.slice(0, -1).join('-');
      }
    }
    
    turnMetadata.set(effectiveTurnId, {
      timestamp: data.timestamp,
      userInput,
      sessionId: displaySessionId,
      turnCount: displayTurnCount ? parseInt(displayTurnCount) : undefined,
    });
    
    const header = document.createElement('div');
    header.className = 'turn-header';
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    const cardsId = `turn-cards-${effectiveTurnId}`;
    
    let headerHtml = `
      <div class="turn-header-left">
        <button class="turn-expand-toggle" data-target="${cardsId}" aria-expanded="true">
          <span class="expand-icon">▼</span>
        </button>
        <span class="turn-label">Turn ${displayTurnCount || '?'}</span>
        ${displaySessionId ? `<span class="turn-session-id">${escapeHtml(displaySessionId.substring(0, 8))}...</span>` : ''}
      </div>
      <div class="turn-header-right">
        <span class="turn-time">${time}</span>
      </div>
    `;
    
    if (userInput) {
      headerHtml += `
        <div class="turn-user-input">
          <span class="turn-user-label">User:</span>
          <span class="turn-user-text">${escapeHtml(userInput.substring(0, 100))}${userInput.length > 100 ? '...' : ''}</span>
        </div>
      `;
    }
    
    header.innerHTML = headerHtml;
    
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'turn-cards';
    cardsContainer.id = cardsId;
    
    // Attach turn expand/collapse handler
    const turnExpandBtn = header.querySelector('.turn-expand-toggle')!;
    turnExpandBtn.addEventListener('click', () => {
      const icon = turnExpandBtn.querySelector('.expand-icon')!;
      const isExpanded = cardsContainer.style.display !== 'none';
      
      cardsContainer.style.display = isExpanded ? 'none' : 'block';
      icon.textContent = isExpanded ? '▶' : '▼';
      turnExpandBtn.setAttribute('aria-expanded', String(!isExpanded));
    });
    
    container.appendChild(header);
    container.appendChild(cardsContainer);
    
    feed.prepend(container);
    turnContainers.set(effectiveTurnId, container);
  }
  
  return turnContainers.get(effectiveTurnId)!;
}

// --- Logic ---
client.connection.on('connected', () => {
  statusDot.classList.add('active');
});

channel.subscribe('log', (msg) => {
  const data = msg.data;
  
  messageCount++;
  countDisplay.innerText = messageCount.toString();

  if (data.section === 'COST' && data.data?.totalCost) {
    sessionCost += data.data.totalCost;
    costDisplay.innerText = formatCurrency(sessionCost);
    costDisplay.classList.add('flash');
    setTimeout(() => costDisplay.classList.remove('flash'), 500);
  }

  const turnId = data.turnId;
  const container = getOrCreateTurnContainer(turnId, data);
  const cardsContainer = container.querySelector('.turn-cards')!;
  
  // Update turn header with user input from USER or INTENT log
  if ((data.section === 'USER' && data.data?.userMessage) || (data.section === 'INTENT' && data.data?.userInput)) {
    const userMessage = data.section === 'USER' ? data.data.userMessage : data.data.userInput;
    const meta = turnMetadata.get(turnId || '');
    if (meta && !meta.userInput) {
      meta.userInput = userMessage;
      const userInputEl = container.querySelector('.turn-user-input');
      if (!userInputEl) {
        const header = container.querySelector('.turn-header')!;
        const userInputDiv = document.createElement('div');
        userInputDiv.className = 'turn-user-input';
        userInputDiv.innerHTML = `
          <span class="turn-user-label">User:</span>
          <span class="turn-user-text">${escapeHtml(userMessage.substring(0, 100))}${userMessage.length > 100 ? '...' : ''}</span>
        `;
        header.appendChild(userInputDiv);
      }
    }
  }

  const card = createCard(data);
  cardsContainer.prepend(card);
  
  const allContainers = Array.from(turnContainers.values());
  if (allContainers.length > 20) {
    const toRemove = allContainers.slice(20);
    toRemove.forEach(container => {
      const turnId = container.dataset.turnId;
      if (turnId) {
        turnContainers.delete(turnId);
        turnMetadata.delete(turnId);
      }
      container.remove();
    });
  }
});
