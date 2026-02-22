import { useMemo } from 'react';
import type { TurnTrace, TraceStepType } from '../../types/trace';

interface TimingWaterfallProps {
  trace: TurnTrace;
}

const STEP_COLORS: Record<TraceStepType, string> = {
  decision: '#6366f1',   // indigo
  llm_call: '#f59e0b',   // amber
  retrieval: '#10b981',  // emerald
  parsing: '#3b82f6',    // blue
  dispatch: '#ef4444',   // red
};

const STEP_LABELS: Record<TraceStepType, string> = {
  decision: 'Decision',
  llm_call: 'LLM Call',
  retrieval: 'Retrieval',
  parsing: 'Parsing',
  dispatch: 'Dispatch',
};

export function TimingWaterfall({ trace }: TimingWaterfallProps) {
  const totalMs = trace.totalDurationMs || 1;

  // Build time axis ticks
  const ticks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => {
      const ms = Math.round((totalMs / count) * i);
      return { ms, pct: (ms / totalMs) * 100 };
    });
  }, [totalMs]);

  // Unique step types present for legend
  const stepTypes = useMemo(() => {
    const types = new Set(trace.steps.map(s => s.type));
    return Array.from(types);
  }, [trace.steps]);

  return (
    <div className="timing-waterfall">
      {/* Legend */}
      <div className="waterfall-legend">
        {stepTypes.map(type => (
          <span key={type} className="waterfall-legend-item">
            <span
              className="waterfall-legend-swatch"
              style={{ backgroundColor: STEP_COLORS[type] }}
            />
            {STEP_LABELS[type]}
          </span>
        ))}
        <span className="waterfall-total">
          Total: {totalMs}ms | Model: {trace.modelUsed}
        </span>
      </div>

      {/* Time axis */}
      <div className="waterfall-axis">
        {ticks.map(tick => (
          <span
            key={tick.ms}
            className="waterfall-tick"
            style={{ left: `${tick.pct}%` }}
          >
            {tick.ms}ms
          </span>
        ))}
      </div>

      {/* Bars */}
      <div className="waterfall-rows">
        {trace.steps.map((step, i) => {
          const leftPct = (step.startMs / totalMs) * 100;
          const widthPct = Math.max((step.durationMs / totalMs) * 100, 0.5); // min 0.5% for visibility
          const color = STEP_COLORS[step.type];
          const isSkipped = step.status === 'skipped';
          const isError = step.status === 'error';

          return (
            <div key={i} className="waterfall-row">
              <div className="waterfall-label" title={step.result}>
                <span className={`waterfall-status ${step.status}`}>
                  {step.status === 'success' ? '\u2713' : step.status === 'error' ? '\u2717' : '\u2014'}
                </span>
                {step.name}
              </div>
              <div className="waterfall-track">
                <div
                  className={`waterfall-bar ${isSkipped ? 'skipped' : ''} ${isError ? 'error' : ''}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: isSkipped ? '#555' : color,
                    opacity: isSkipped ? 0.4 : 1,
                  }}
                  title={`${step.name}: ${step.durationMs}ms — ${step.result}`}
                >
                  {step.durationMs > 0 && widthPct > 5 && (
                    <span className="waterfall-bar-text">{step.durationMs}ms</span>
                  )}
                </div>
              </div>
              <div className="waterfall-duration">
                {step.durationMs > 0 ? `${step.durationMs}ms` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
