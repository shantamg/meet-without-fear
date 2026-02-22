import { Turn } from '../../utils/turnGrouping';

interface PlaybackControlsProps {
  turns: Turn[];
  currentTurn: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (index: number) => void;
}

const SPEED_OPTIONS = [1, 2, 5];

/** Stage number from turn activities metadata */
function getStageForTurn(turn: Turn): number | null {
  for (const activity of turn.activities) {
    if (activity.metadata?.stage != null) {
      return Number(activity.metadata.stage);
    }
  }
  return null;
}

const STAGE_COLORS: Record<number, string> = {
  0: 'var(--stage-0)',
  1: 'var(--stage-1)',
  2: 'var(--stage-2)',
  3: 'var(--stage-3)',
  4: 'var(--stage-4)',
};

export function PlaybackControls({
  turns,
  currentTurn,
  isPlaying,
  playbackSpeed,
  onFirst,
  onPrev,
  onNext,
  onTogglePlay,
  onSpeedChange,
  onSeek,
}: PlaybackControlsProps) {
  const totalTurns = turns.length;

  // Detect stage transitions for markers
  const stageAtIndex = turns.map(getStageForTurn);

  return (
    <div className="playback-controls">
      <div className="playback-timeline">
        {turns.map((_, i) => {
          const stage = stageAtIndex[i];
          const isStageTransition =
            stage !== null && (i === 0 || stageAtIndex[i - 1] !== stage);
          const isCurrent = i === currentTurn;

          return (
            <button
              key={i}
              className={`playback-marker${isCurrent ? ' active' : ''}${isStageTransition ? ' stage-transition' : ''}`}
              style={
                isStageTransition && stage !== null
                  ? { backgroundColor: STAGE_COLORS[stage] || 'var(--accent)' }
                  : undefined
              }
              onClick={() => onSeek(i)}
              title={`Turn ${i + 1}${isStageTransition ? ` (Stage ${stage})` : ''}`}
            />
          );
        })}
      </div>

      <div className="playback-buttons">
        <button
          className="playback-btn"
          onClick={onFirst}
          disabled={currentTurn === 0}
          title="First turn"
        >
          {'\u23EE'}
        </button>
        <button
          className="playback-btn"
          onClick={onPrev}
          disabled={currentTurn === 0}
          title="Previous turn"
        >
          {'\u23F4'}
        </button>
        <button
          className="playback-btn play-pause"
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <button
          className="playback-btn"
          onClick={onNext}
          disabled={currentTurn >= totalTurns - 1}
          title="Next turn"
        >
          {'\u23F5'}
        </button>

        <span className="playback-counter">
          Turn {currentTurn + 1} of {totalTurns}
        </span>

        {stageAtIndex[currentTurn] !== null && (
          <span
            className="playback-stage-badge"
            style={{
              backgroundColor:
                STAGE_COLORS[stageAtIndex[currentTurn]!] || 'var(--accent)',
            }}
          >
            Stage {stageAtIndex[currentTurn]}
          </span>
        )}

        <div className="playback-speed">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              className={`speed-btn${playbackSpeed === s ? ' active' : ''}`}
              onClick={() => onSpeedChange(s)}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
