import React from 'react';
import { EmotionalThread } from '../../types';

interface EmotionalThreadSectionProps {
  emotionalThread: EmotionalThread;
}

/**
 * EmotionalSparkline renders a simple SVG sparkline showing emotional intensity over time.
 */
function EmotionalSparkline({ shifts, current }: { shifts: EmotionalThread['notableShifts']; current: number | null }) {
  if (!current && shifts.length === 0) return null;

  // Build data points from shifts
  const points: number[] = [];
  if (shifts.length > 0) {
    points.push(shifts[0].from);
    shifts.forEach(s => points.push(s.to));
  } else if (current !== null) {
    points.push(current);
  }

  if (points.length === 0) return null;

  // Normalize to SVG coordinates (0-10 intensity maps to 0-30 height, inverted)
  const width = 100;
  const height = 30;
  const padding = 2;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  const pathPoints = points.map((val, idx) => {
    const x = padding + (idx / Math.max(points.length - 1, 1)) * availableWidth;
    const y = padding + availableHeight - (val / 10) * availableHeight;
    return `${x},${y}`;
  });

  const path = `M ${pathPoints.join(' L ')}`;

  return (
    <svg className="emotional-sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <path d={path} fill="none" stroke="var(--color-purple)" strokeWidth="2" />
      {points.map((val, idx) => {
        const x = padding + (idx / Math.max(points.length - 1, 1)) * availableWidth;
        const y = padding + availableHeight - (val / 10) * availableHeight;
        return <circle key={idx} cx={x} cy={y} r="3" fill="var(--color-purple)" />;
      })}
    </svg>
  );
}

/**
 * EmotionalThreadSection displays emotional state as a mini timeline with sparkline.
 */
export function EmotionalThreadSection({ emotionalThread }: EmotionalThreadSectionProps) {
  const { initialIntensity, currentIntensity, trend, notableShifts } = emotionalThread;

  const hasData = currentIntensity !== null || notableShifts.length > 0;

  const trendIcon = {
    escalating: '\u2191', // up arrow
    'de-escalating': '\u2193', // down arrow
    stable: '\u2194', // left-right arrow
    unknown: '-',
  }[trend];

  const trendClass = {
    escalating: 'escalating',
    'de-escalating': 'de-escalating',
    stable: 'stable',
    unknown: 'unknown',
  }[trend];

  return (
    <div className="context-section emotional-thread">
      <div className="section-header">
        <h4>Emotional Thread</h4>
        {currentIntensity !== null && (
          <span className="intensity-value">{currentIntensity}/10</span>
        )}
      </div>

      <div className="section-content">
        {!hasData ? (
          <div className="empty-section">No emotional data</div>
        ) : (
          <div className="emotional-content">
            <EmotionalSparkline shifts={notableShifts} current={currentIntensity} />

            <div className="emotional-stats">
              <div className={`trend-indicator ${trendClass}`}>
                <span className="trend-icon">{trendIcon}</span>
                <span className="trend-label">{trend}</span>
              </div>

              {initialIntensity !== null && currentIntensity !== null && (
                <div className="intensity-change">
                  {initialIntensity} &rarr; {currentIntensity}
                </div>
              )}
            </div>

            {notableShifts.length > 0 && (
              <div className="notable-shifts">
                <span className="shifts-label">Notable shifts:</span>
                {notableShifts.map((shift, idx) => (
                  <span key={idx} className="shift-badge">
                    {shift.from} &rarr; {shift.to}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
