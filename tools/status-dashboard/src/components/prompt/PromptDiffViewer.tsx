import { useState, useMemo } from 'react';
import {
  computeDiff,
  computeHunks,
  detectChangeCategories,
  type DiffHunk,
  type ChangeCategory,
} from '../../utils/diffEngine';

interface PromptDiffViewerProps {
  oldText: string;
  newText: string;
  onClose: () => void;
}

type ViewMode = 'unified' | 'split';

const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  TURN_COUNTER: 'Turn Counter',
  INTENSITY_CHANGE: 'Intensity',
  PHASE_SHIFT: 'Phase Shift',
  STAGE_TRANSITION: 'Stage Transition',
};

const CATEGORY_COLORS: Record<ChangeCategory, string> = {
  TURN_COUNTER: 'var(--text-muted)',
  INTENSITY_CHANGE: 'var(--color-warning)',
  PHASE_SHIFT: 'var(--accent)',
  STAGE_TRANSITION: 'var(--color-error)',
};

export function PromptDiffViewer({ oldText, newText, onClose }: PromptDiffViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('unified');

  const diff = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);
  const hunks = useMemo(() => computeHunks(diff), [diff]);
  const categories = useMemo(() => detectChangeCategories(oldText, newText), [oldText, newText]);

  const totalAdded = diff.filter(l => l.type === 'added').length;
  const totalRemoved = diff.filter(l => l.type === 'removed').length;

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <div className="diff-header-left">
          <span className="diff-title">Prompt Diff</span>
          <span className="diff-stats">
            <span className="diff-stat-added">+{totalAdded}</span>
            <span className="diff-stat-removed">-{totalRemoved}</span>
          </span>
        </div>
        <div className="diff-header-right">
          {categories.length > 0 && (
            <div className="diff-categories">
              {categories.map(cat => (
                <span
                  key={cat}
                  className="diff-category-badge"
                  style={{ borderColor: CATEGORY_COLORS[cat], color: CATEGORY_COLORS[cat] }}
                >
                  {CATEGORY_LABELS[cat]}
                </span>
              ))}
            </div>
          )}
          <div className="diff-view-toggle">
            <button
              className={`diff-toggle-btn ${viewMode === 'unified' ? 'active' : ''}`}
              onClick={() => setViewMode('unified')}
            >
              Unified
            </button>
            <button
              className={`diff-toggle-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
            >
              Split
            </button>
          </div>
          <button className="diff-close-btn" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="diff-body">
        {hunks.length === 0 ? (
          <div className="diff-no-changes">No changes detected</div>
        ) : viewMode === 'unified' ? (
          <UnifiedView hunks={hunks} />
        ) : (
          <SplitView hunks={hunks} diff={diff} />
        )}
      </div>
    </div>
  );
}

function UnifiedView({ hunks }: { hunks: DiffHunk[] }) {
  const [collapsedGaps, setCollapsedGaps] = useState<Set<number>>(new Set(
    // Start with all gaps collapsed
    Array.from({ length: hunks.length + 1 }, (_, i) => i)
  ));

  const toggleGap = (index: number) => {
    setCollapsedGaps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="diff-unified">
      {hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx} className="diff-hunk">
          {hunkIdx === 0 && hunk.oldStart > 1 && collapsedGaps.has(0) && (
            <button className="diff-expander" onClick={() => toggleGap(0)}>
              Show {hunk.oldStart - 1} unchanged lines above
            </button>
          )}
          <div className="diff-hunk-header">
            @@ -{hunk.oldStart} +{hunk.newStart} @@
          </div>
          {hunk.lines.map((line, lineIdx) => (
            <div
              key={lineIdx}
              className={`diff-line diff-line-${line.type}`}
            >
              <span className="diff-gutter">
                {line.type === 'removed' ? line.oldLineNumber : ''}
              </span>
              <span className="diff-gutter">
                {line.type === 'added' ? line.newLineNumber : line.type === 'same' ? line.newLineNumber : ''}
              </span>
              <span className="diff-marker">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span className="diff-content">{line.content}</span>
            </div>
          ))}
          {hunkIdx < hunks.length - 1 && collapsedGaps.has(hunkIdx + 1) && (
            <button className="diff-expander" onClick={() => toggleGap(hunkIdx + 1)}>
              Show {(hunks[hunkIdx + 1].oldStart) - (hunk.oldStart + hunk.lines.length)} unchanged lines
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function SplitView({ hunks, diff }: { hunks: DiffHunk[]; diff: ReturnType<typeof computeDiff> }) {
  // Build parallel left/right lines for split view
  const pairs = useMemo(() => {
    const result: Array<{
      left: { lineNumber?: number; content: string; type: 'same' | 'removed' | 'empty' };
      right: { lineNumber?: number; content: string; type: 'same' | 'added' | 'empty' };
    }> = [];

    for (const hunk of hunks) {
      // Collect removed and added runs
      let i = 0;
      while (i < hunk.lines.length) {
        const line = hunk.lines[i];
        if (line.type === 'same') {
          result.push({
            left: { lineNumber: line.oldLineNumber, content: line.content, type: 'same' },
            right: { lineNumber: line.newLineNumber, content: line.content, type: 'same' },
          });
          i++;
        } else {
          // Collect consecutive removed + added
          const removed: typeof hunk.lines = [];
          const added: typeof hunk.lines = [];
          while (i < hunk.lines.length && hunk.lines[i].type === 'removed') {
            removed.push(hunk.lines[i]);
            i++;
          }
          while (i < hunk.lines.length && hunk.lines[i].type === 'added') {
            added.push(hunk.lines[i]);
            i++;
          }
          const maxLen = Math.max(removed.length, added.length);
          for (let j = 0; j < maxLen; j++) {
            result.push({
              left: j < removed.length
                ? { lineNumber: removed[j].oldLineNumber, content: removed[j].content, type: 'removed' }
                : { content: '', type: 'empty' },
              right: j < added.length
                ? { lineNumber: added[j].newLineNumber, content: added[j].content, type: 'added' }
                : { content: '', type: 'empty' },
            });
          }
        }
      }
    }
    return result;
  }, [hunks, diff]);

  return (
    <div className="diff-split">
      <div className="diff-split-header">
        <div className="diff-split-col-header">Previous</div>
        <div className="diff-split-col-header">Current</div>
      </div>
      {pairs.map((pair, idx) => (
        <div key={idx} className="diff-split-row">
          <div className={`diff-split-cell diff-line-${pair.left.type}`}>
            <span className="diff-gutter">{pair.left.lineNumber ?? ''}</span>
            <span className="diff-content">{pair.left.content}</span>
          </div>
          <div className={`diff-split-cell diff-line-${pair.right.type}`}>
            <span className="diff-gutter">{pair.right.lineNumber ?? ''}</span>
            <span className="diff-content">{pair.right.content}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
