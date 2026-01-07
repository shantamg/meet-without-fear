import Ably from 'ably';
import './style.css';

const ablyKey = import.meta.env.VITE_ABLY_KEY;
if (!ablyKey) throw new Error('VITE_ABLY_KEY missing');

const client = new Ably.Realtime(ablyKey);
const channel = client.channels.get('ai-audit-stream');

// --- State ---
let sessionCost = 0.0000;
const turnContainers = new Map<string, HTMLElement>();
const turnMetadata = new Map<string, { timestamp: string; userInput?: string; sessionId?: string; turnCount?: number }>();

// --- DOM Elements ---
const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="dashboard-header">
    <div class="brand">
      <span class="pulse-dot" id="status-dot"></span>
      <h1>Monitor</h1>
    </div>
    <div class="metrics">
      <div class="metric">
        <span class="value" id="cost-display">$0.0000</span>
      </div>
    </div>
  </div>
  <div id="feed" class="feed-container"></div>
`;

const feed = document.getElementById('feed')!;
const costDisplay = document.getElementById('cost-display')!;
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
  if (!text || typeof text !== 'string') return null;
  
  // Try parsing the whole text first
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue to try extracting JSON
  }
  
  // Try to find JSON object in the text (handle markdown code blocks, etc.)
  // Look for { ... } pattern, but be smarter about matching braces
  let braceCount = 0;
  let startIdx = -1;
  let endIdx = -1;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (startIdx === -1) startIdx = i;
      braceCount++;
    } else if (text[i] === '}') {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) {
        endIdx = i;
        break;
      }
    }
  }
  
  if (startIdx !== -1 && endIdx !== -1) {
    try {
      let jsonStr = text.substring(startIdx, endIdx + 1);
      
      // Try to fix common JSON issues: unescaped newlines in strings
      // This is a heuristic - try to escape newlines in string values
      jsonStr = jsonStr.replace(/"([^"]*)\n([^"]*)"/g, (match, before, after) => {
        // Only fix if it looks like a string value (not a key)
        return `"${before}\\n${after}"`;
      });
      
      return JSON.parse(jsonStr);
    } catch (e) {
      // If that failed, try a more aggressive fix for newlines
      try {
        let jsonStr = text.substring(startIdx, endIdx + 1);
        // Replace unescaped newlines in string values (between quotes)
        jsonStr = jsonStr.replace(/(:"[^"]*?)\n([^"]*?")/g, '$1\\n$2');
        jsonStr = jsonStr.replace(/(:"[^"]*?)\r\n([^"]*?")/g, '$1\\n$2');
        return JSON.parse(jsonStr);
      } catch {
        // Continue to try regex fallback
      }
    }
  }
  
  // Fallback: try regex match (less reliable but might catch some cases)
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      // Try to fix newlines
      jsonStr = jsonStr.replace(/(:"[^"]*?)\n([^"]*?")/g, '$1\\n$2');
      return JSON.parse(jsonStr);
    }
  } catch {
    // Give up
  }
  
  return null;
}

function renderJsonKeyValue(obj: any, maxDepth = 3, currentDepth = 0): string {
  if (currentDepth >= maxDepth) {
    const str = JSON.stringify(obj);
    return str.length > 100 ? `<span class="json-value-truncated">${escapeHtml(str.substring(0, 100))}...</span>` : escapeHtml(str);
  }
  
  if (obj === null) return '<span class="json-value-null">null</span>';
  if (obj === undefined) return '<span class="json-value-undefined">undefined</span>';
  if (typeof obj === 'string') return `<span class="json-value-string">${escapeHtml(obj)}</span>`;
  if (typeof obj === 'number') return `<span class="json-value-number">${obj}</span>`;
  if (typeof obj === 'boolean') return `<span class="json-value-boolean">${obj}</span>`;
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span class="json-value-empty">[]</span>';
    // If array contains objects, render each as key-value pairs
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null && !Array.isArray(obj[0])) {
      return obj.map((item, i) => 
        `<div class="json-array-item"><span class="json-array-index">[${i}]</span> ${renderJsonKeyValue(item, maxDepth, currentDepth + 1)}</div>`
      ).join('');
    }
    // Simple array of primitives
    if (obj.length <= 5) {
      return `<span class="json-value-array">[${obj.map(item => renderJsonKeyValue(item, maxDepth, currentDepth + 1)).join(', ')}]</span>`;
    }
    return `<span class="json-value-array">[${obj.length} items: ${obj.slice(0, 3).map(item => renderJsonKeyValue(item, maxDepth, currentDepth + 1)).join(', ')}...]</span>`;
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '<span class="json-value-empty">{}</span>';
    
    return keys.map(key => {
      const value = renderJsonKeyValue(obj[key], maxDepth, currentDepth + 1);
      return `<div class="json-kv-item"><span class="json-key">${escapeHtml(key)}</span>: ${value}</div>`;
    }).join('');
  }
  
  return escapeHtml(String(obj));
}


function createCard(data: any) {
  // Show USER, INTENT, RETRIEVAL, RESPONSE, and COST sections
  if (!['USER', 'INTENT', 'RETRIEVAL', 'RESPONSE', 'COST'].includes(data.section)) {
    return null;
  }

  const card = document.createElement('div');
  card.className = `log-card type-${data.section}`;
  
  const time = new Date(data.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
  const meta = data.data || {};

  let contentHtml = '';
  
  if (data.section === 'USER') {
    // Show full user message
    const message = meta.userMessage || '';
    contentHtml = `<div class="user-text">${escapeHtml(message)}</div>`;
  } else if (data.section === 'INTENT') {
    // Just show the reason/thought
    contentHtml = meta.reason ? `<div class="thought-text">${escapeHtml(meta.reason)}</div>` : '';
  } else if (data.section === 'RETRIEVAL') {
    // Show comprehensive retrieval information
    const parts: string[] = [];
    
    // Show search queries if available
    if (meta.searchQueries && meta.searchQueries.length > 0) {
      parts.push(`<div class="retrieval-section"><span class="retrieval-label">Queries:</span> ${meta.searchQueries.map((q: string) => `<span class="retrieval-query">${escapeHtml(q)}</span>`).join(', ')}</div>`);
    }
    
    // Show references detected
    if (meta.referencesDetected && meta.referencesDetected.length > 0) {
      parts.push(`<div class="retrieval-section"><span class="retrieval-label">References:</span> ${meta.referencesDetected.map((r: any) => `<span class="retrieval-ref">${escapeHtml(r.text)}</span>`).join(', ')}</div>`);
    }
    
    // Show top matches
    if (meta.topMatches && meta.topMatches.length > 0) {
      parts.push(`<div class="retrieval-section"><span class="retrieval-label">Matches (${meta.topMatches.length}):</span></div>`);
      parts.push(`
        <div class="retrieval-memories">
          ${meta.topMatches.map((m: any) => `
            <div class="memory-item">
              <span class="memory-source ${m.source === 'cross-session' ? 'cross' : 'within'}">${m.source === 'cross-session' ? 'other' : 'this'}</span>
              <span class="memory-content">${escapeHtml(m.content)}</span>
            </div>
          `).join('')}
        </div>
      `);
    }
    
    // Show samples
    if (meta.crossSessionSamples || meta.withinSessionSamples) {
      const crossCount = meta.crossSessionSamples?.length || 0;
      const withinCount = meta.withinSessionSamples?.length || 0;
      if (crossCount > 0 || withinCount > 0) {
        parts.push(`<div class="retrieval-section"><span class="retrieval-label">Samples:</span> ${crossCount} cross-session, ${withinCount} within-session</div>`);
      }
      const allSamples: any[] = [
        ...(meta.crossSessionSamples || []).map((m: any) => ({...m, source: 'cross-session'})),
        ...(meta.withinSessionSamples || []).map((m: any) => ({...m, source: 'within-session'}))
      ];
      if (allSamples.length > 0) {
        parts.push(`
          <div class="retrieval-memories">
            ${allSamples.map((m: any) => `
              <div class="memory-item">
                <span class="memory-source ${m.source === 'cross-session' ? 'cross' : 'within'}">${m.source === 'cross-session' ? 'other' : 'this'}</span>
                <span class="memory-content">${escapeHtml(m.content)}</span>
              </div>
            `).join('')}
          </div>
        `);
      }
    }
    
    // Show counts
    if (meta.crossSessionResults !== undefined || meta.withinSessionResults !== undefined) {
      parts.push(`<div class="retrieval-section"><span class="retrieval-label">Results:</span> ${meta.crossSessionResults || 0} cross-session, ${meta.withinSessionResults || 0} within-session</div>`);
    }
    
    // Show summary/message if no other data
    if (parts.length === 0) {
      parts.push(`<div class="retrieval-summary">${escapeHtml(meta.summary || data.message || 'No retrieval details')}</div>`);
    }
    
    contentHtml = parts.join('');
  } else if (data.section === 'RESPONSE') {
    // Show response text or JSON as key-value pairs
    // Check multiple possible fields for the response
    let responseText = meta.responseText || meta.responsePreview || data.message || '';
    
    // Check if meta already has a parsed response object
    if (meta.response && typeof meta.response === 'object' && !Array.isArray(meta.response)) {
      contentHtml = `<div class="response-json">${renderJsonKeyValue(meta.response, 3)}</div>`;
    } else if (responseText) {
      // Check if text looks like JSON (starts with { or [)
      const trimmedText = responseText.trim();
      const looksLikeJson = trimmedText.startsWith('{') || trimmedText.startsWith('[');
      
      if (looksLikeJson) {
        // Try to parse as JSON - be more aggressive about finding complete JSON
        let parsedJson = parseJsonSafely(responseText);
        
        // If parsing failed and text is truncated (ends with ...), try to reconstruct
        if (!parsedJson && responseText.endsWith('...') && responseText.length >= 500) {
          // The response might be truncated, but we can still try to parse what we have
          // Remove the ... and try to close any open braces
          let attemptText = responseText.replace(/\.\.\.$/, '');
          // Try to close JSON if it's incomplete
          let openBraces = (attemptText.match(/\{/g) || []).length;
          let closeBraces = (attemptText.match(/\}/g) || []).length;
          if (openBraces > closeBraces) {
            attemptText += '}'.repeat(openBraces - closeBraces);
          }
          parsedJson = parseJsonSafely(attemptText);
        }
        
        if (parsedJson && typeof parsedJson === 'object') {
          // Render as compact key-value pairs
          contentHtml = `<div class="response-json">${renderJsonKeyValue(parsedJson, 3)}</div>`;
        } else {
          // JSON parsing failed, but it looks like JSON - try to show it formatted anyway
          // Extract what we can and show it
          contentHtml = `<div class="response-text response-json-error">${escapeHtml(responseText)}</div>`;
        }
      } else {
        // Show as plain text, full content
        contentHtml = `<div class="response-text">${escapeHtml(responseText)}</div>`;
      }
    }
  } else if (data.section === 'COST') {
    const costValue = meta.totalCost || 0;
    contentHtml = `
      <div class="cost-simple">
        <span class="cost-amount">${formatCurrency(costValue)}</span>
        <span class="cost-tokens">${meta.inputTokens || 0}/${meta.outputTokens || 0}</span>
      </div>
    `;
  }

  if (!contentHtml) {
    return null;
  }
  
  card.innerHTML = `
    <div class="card-header">
      <span class="section-tag">${data.section}</span>
      <span class="timestamp">${time}</span>
    </div>
    <div class="card-content">${contentHtml}</div>
  `;

  return card;
}

// --- Turn Container Management ---
function getOrCreateTurnContainer(turnId: string | undefined, data: any): HTMLElement {
  // Use turnId if available, otherwise try to construct from sessionId + turnCount
  const meta = data.data || {};
  const sessionId = meta.sessionId || data.data?.sessionId || '';
  const turnCount = meta.turnCount || data.data?.turnCount;
  
  let effectiveTurnId = turnId;
  if (!effectiveTurnId && sessionId && turnCount !== undefined) {
    effectiveTurnId = `${sessionId}-${turnCount}`;
  }
  if (!effectiveTurnId) {
    // Last resort: use timestamp-based orphan ID, but try to group by sessionId if available
    if (sessionId) {
      effectiveTurnId = `orphan-${sessionId}-${Date.now()}`;
    } else {
      effectiveTurnId = `orphan-${Date.now()}`;
    }
  }
  
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
          <span class="turn-user-text">${escapeHtml(userInput)}</span>
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
    const effectiveTurnId = turnId || (data.data?.sessionId && data.data?.turnCount ? `${data.data.sessionId}-${data.data.turnCount}` : `orphan-${Date.now()}`);
    const meta = turnMetadata.get(effectiveTurnId);
    if (meta && !meta.userInput) {
      meta.userInput = userMessage;
      const userInputEl = container.querySelector('.turn-user-input');
      if (!userInputEl) {
        const header = container.querySelector('.turn-header')!;
        const userInputDiv = document.createElement('div');
        userInputDiv.className = 'turn-user-input';
        userInputDiv.innerHTML = `
          <span class="turn-user-label">User:</span>
          <span class="turn-user-text">${escapeHtml(userMessage)}</span>
        `;
        header.appendChild(userInputDiv);
      }
    }
  }

  const card = createCard(data);
  if (card) {
    cardsContainer.prepend(card);
  }
  
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
