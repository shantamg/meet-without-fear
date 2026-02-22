export const STAGE_LABELS: Record<number, string> = {
  0: 'Pre-Session',
  1: 'Feel Heard',
  2: 'Perspective',
  3: 'Needs',
  4: 'Resolution',
};

export const MODEL_COLORS = {
  sonnet: '#3b82f6',
  haiku: '#10b981',
  titan: '#eab308',
};

export function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

export const TOKEN_BUDGET_LIMIT = 150_000;
