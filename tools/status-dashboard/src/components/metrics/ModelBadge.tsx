interface ModelBadgeProps {
  model: string;
}

function getModelClass(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('titan')) return 'titan';
  return 'unknown';
}

function getModelLabel(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  if (lower.includes('titan')) return 'Titan';
  return model;
}

export function ModelBadge({ model }: ModelBadgeProps) {
  return (
    <span className={`model-badge ${getModelClass(model)}`}>
      {getModelLabel(model)}
    </span>
  );
}
