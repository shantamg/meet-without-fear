import { useNavigate } from 'react-router-dom';
import { Session, SessionSortField, SortOrder } from '../../types';
import { StageBadge } from '../metrics/StageBadge';
import { FormattedPrice } from '../session/FormattedPrice';

interface SessionTableProps {
  sessions: Session[];
  sort?: SessionSortField;
  order?: SortOrder;
  onSort: (field: SessionSortField) => void;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function isSessionActive(status: string): boolean {
  return status === 'ACTIVE' || status === 'WAITING';
}

function getParticipantDisplay(session: Session): string | null {
  if (session.type === 'INNER_WORK') return 'Inner Thoughts';
  if (session.participants) return session.participants;
  if (session.relationship?.members && session.relationship.members.length > 0) {
    return session.relationship.members
      .map(m => m.user.firstName || m.user.email)
      .join(' & ');
  }
  if (session.title) return session.title;
  // Empty participants with a relationship that has no members means users were deleted
  if (session.relationship && (!session.relationship.members || session.relationship.members.length === 0)) {
    return null; // Signal "Deleted Users"
  }
  return 'Unknown';
}

const SORTABLE_COLUMNS: { field: SessionSortField; label: string }[] = [
  { field: 'participants', label: 'Participants' },
  { field: 'status', label: 'Status' },
  { field: 'stage', label: 'Stage' },
  { field: 'turns', label: 'Turns' },
  { field: 'cost', label: 'Cost' },
  { field: 'age', label: 'Age' },
];

export function SessionTable({ sessions, sort, order, onSort }: SessionTableProps) {
  const navigate = useNavigate();

  const renderSortArrow = (field: SessionSortField) => {
    if (sort !== field) return null;
    return <span className="sort-arrow">{order === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  if (sessions.length === 0) {
    return (
      <div className="session-table-empty">
        <p>No sessions match your filters</p>
      </div>
    );
  }

  return (
    <div className="session-table-wrapper">
      <table className="session-table">
        <thead>
          <tr>
            <th className="col-indicator" />
            {SORTABLE_COLUMNS.map(col => (
              <th
                key={col.field}
                className={`col-${col.field} sortable ${sort === col.field ? 'sorted' : ''}`}
                onClick={() => onSort(col.field)}
              >
                {col.label} {renderSortArrow(col.field)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map(session => (
            <tr
              key={session.id}
              className="session-row"
              onClick={() => navigate(`/sessions/${session.id}`)}
            >
              <td className="col-indicator">
                <span className={`activity-dot ${isSessionActive(session.status) ? 'active' : 'inactive'}`} />
              </td>
              <td className="col-participants">
                {(() => {
                  const display = getParticipantDisplay(session);
                  if (display === null) {
                    return <span className="participant-name" style={{ color: 'var(--text-tertiary, #6b7280)', fontStyle: 'italic' }}>Deleted Users</span>;
                  }
                  return <span className="participant-name">{display}</span>;
                })()}
                {session.type === 'INNER_WORK' && (
                  <span className="type-tag inner">Solo</span>
                )}
              </td>
              <td className="col-status">
                <span className={`status-badge ${session.status.toLowerCase()}`}>
                  {session.status}
                </span>
              </td>
              <td className="col-stage">
                <StageBadge stage={session.stage ?? 0} />
              </td>
              <td className="col-turns mono">{session.stats?.turnCount ?? 0}</td>
              <td className="col-cost">
                <FormattedPrice value={session.stats?.totalCost} />
              </td>
              <td className="col-age mono">{formatRelativeTime(session.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
