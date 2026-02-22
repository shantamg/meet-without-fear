interface CacheIndicatorProps {
  cached: boolean;
  hitRate?: number;
}

export function CacheIndicator({ cached, hitRate }: CacheIndicatorProps) {
  return (
    <span className={`cache-indicator ${cached ? 'cached' : 'miss'}`}>
      {cached ? 'CACHED \u2713' : 'MISS'}
      {hitRate !== undefined && (
        <span className="cache-indicator-rate">{(hitRate * 100).toFixed(0)}%</span>
      )}
    </span>
  );
}
