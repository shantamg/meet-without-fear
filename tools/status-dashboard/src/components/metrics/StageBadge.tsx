interface StageBadgeProps {
  stage: number;
}

const STAGE_NAMES: Record<number, string> = {
  0: 'Setup',
  1: 'Feel Heard',
  2: 'Perspective',
  3: 'Needs',
  4: 'Resolution',
};

export function StageBadge({ stage }: StageBadgeProps) {
  const name = STAGE_NAMES[stage] || `Stage ${stage}`;
  return (
    <span className={`stage-pill stage-${stage}`}>
      {stage} {name}
    </span>
  );
}
