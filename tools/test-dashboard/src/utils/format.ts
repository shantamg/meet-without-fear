// Small formatting helpers shared across pages.

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

export function shortSha(sha: string | null): string {
  if (!sha) return '—';
  return sha.slice(0, 7);
}

const GITHUB_REPO = 'ShantamG/meet-without-fear'; // adjust if needed

export function githubShaUrl(sha: string | null): string | null {
  if (!sha) return null;
  return `https://github.com/${GITHUB_REPO}/commit/${sha}`;
}

export function githubFileUrl(
  file: string | null,
  line: number | null,
  sha: string | null
): string | null {
  if (!file) return null;
  const ref = sha ?? 'main';
  const lineFrag = line ? `#L${line}` : '';
  return `https://github.com/${GITHUB_REPO}/blob/${ref}/${file}${lineFrag}`;
}
