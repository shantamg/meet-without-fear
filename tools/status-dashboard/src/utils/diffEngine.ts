export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  content: string;
  lineNumber: number;
  /** Line number in the old text (for removed/same lines) */
  oldLineNumber?: number;
  /** Line number in the new text (for added/same lines) */
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

/**
 * Categories of prompt changes that can be detected.
 */
export type ChangeCategory = 'TURN_COUNTER' | 'INTENSITY_CHANGE' | 'PHASE_SHIFT' | 'STAGE_TRANSITION';

/**
 * Compute a line-by-line diff between two texts using a simple LCS-based approach.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to get the diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: 'same',
        content: oldLines[i - 1],
        lineNumber: i,
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: 'added',
        content: newLines[j - 1],
        lineNumber: j,
        newLineNumber: j,
      });
      j--;
    } else {
      stack.push({
        type: 'removed',
        content: oldLines[i - 1],
        lineNumber: i,
        oldLineNumber: i,
      });
      i--;
    }
  }

  // Reverse since we built it backwards
  while (stack.length > 0) {
    result.push(stack.pop()!);
  }

  return result;
}

/**
 * Group diff lines into hunks with surrounding context.
 */
export function computeHunks(diff: DiffLine[], contextLines: number = 3): DiffHunk[] {
  if (diff.length === 0) return [];

  // Find indices of changed lines
  const changedIndices: number[] = [];
  for (let i = 0; i < diff.length; i++) {
    if (diff[i].type !== 'same') {
      changedIndices.push(i);
    }
  }

  if (changedIndices.length === 0) return [];

  // Group changed indices into ranges with context
  const ranges: Array<{ start: number; end: number }> = [];

  for (const idx of changedIndices) {
    const start = Math.max(0, idx - contextLines);
    const end = Math.min(diff.length - 1, idx + contextLines);

    if (ranges.length > 0 && start <= ranges[ranges.length - 1].end + 1) {
      // Merge with previous range
      ranges[ranges.length - 1].end = end;
    } else {
      ranges.push({ start, end });
    }
  }

  // Convert ranges to hunks
  return ranges.map(range => {
    const lines = diff.slice(range.start, range.end + 1);
    const firstLine = lines[0];
    return {
      oldStart: firstLine.oldLineNumber ?? firstLine.lineNumber,
      newStart: firstLine.newLineNumber ?? firstLine.lineNumber,
      lines,
    };
  });
}

/**
 * Detect what categories of changes occurred between two prompt texts.
 */
export function detectChangeCategories(oldText: string, newText: string): ChangeCategory[] {
  const categories: ChangeCategory[] = [];

  // Check for turn counter changes
  const turnPattern = /turn\s*(?:#|number|:)\s*\d+/i;
  const oldTurn = oldText.match(turnPattern);
  const newTurn = newText.match(turnPattern);
  if (oldTurn && newTurn && oldTurn[0] !== newTurn[0]) {
    categories.push('TURN_COUNTER');
  }

  // Check for intensity/emotional level changes
  const intensityPattern = /intensity|emotional\s*level|escalation/i;
  const oldIntensityLines = oldText.split('\n').filter(l => intensityPattern.test(l));
  const newIntensityLines = newText.split('\n').filter(l => intensityPattern.test(l));
  if (JSON.stringify(oldIntensityLines) !== JSON.stringify(newIntensityLines)) {
    categories.push('INTENSITY_CHANGE');
  }

  // Check for phase changes (gathering/reflecting within a stage)
  const phasePattern = /phase\s*[:=]\s*\w+|gathering|reflecting/i;
  const oldPhase = oldText.match(phasePattern);
  const newPhase = newText.match(phasePattern);
  if (oldPhase && newPhase && oldPhase[0] !== newPhase[0]) {
    categories.push('PHASE_SHIFT');
  }

  // Check for stage transitions
  const stagePattern = /stage\s*(?:#|:)?\s*\d/i;
  const oldStage = oldText.match(stagePattern);
  const newStage = newText.match(stagePattern);
  if (oldStage && newStage && oldStage[0] !== newStage[0]) {
    categories.push('STAGE_TRANSITION');
  }

  return categories;
}
