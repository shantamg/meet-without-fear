import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SnapshotNode } from '../types';
import { listSnapshots } from '../services/api';

export function SnapshotsTreePage() {
  const [tree, setTree] = useState<SnapshotNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSnapshots()
      .then((t) => {
        setTree(t);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load snapshots');
      });
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Snapshots</h2>
          <div className="page-subtitle">Branching tree of saved DB states.</div>
        </div>
      </div>

      {error && <div className="error-banner">Error: {error}</div>}
      {tree === null && <div className="loading">Loading snapshots…</div>}

      {tree && tree.length === 0 && (
        <div className="empty">No snapshots yet.</div>
      )}

      {tree && tree.length > 0 && (
        <ul className="snapshot-tree">
          {tree.map((node) => (
            <TreeNode key={node.id} node={node} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TreeNode({ node }: { node: SnapshotNode }) {
  return (
    <li>
      <Link to={`/snapshot/${node.id}`} className="snapshot-link">
        <span className="mono">{node.name}</span>
        <span className="run-count">({node.run_count} runs)</span>
      </Link>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
