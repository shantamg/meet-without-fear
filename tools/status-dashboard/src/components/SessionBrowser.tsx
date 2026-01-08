
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Session } from '../types';

function SessionBrowser() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/audit/sessions'); // Assuming standard port
      // Actually, we need to know the backend URL. VITE_BACKEND_URL?
      // For now, hardcode or use relative if proxied. 
      // Vite config shows proxy? No proxyconfig in vite.config.ts yet.
      // I should configure proxy in vite.config.ts or use full URL.
      // Let's assume localhost:3000 for now.

      const json = await res.json();
      if (json.success) {
        setSessions(json.data);
      } else {
        setError('Failed to load sessions');
      }
    } catch (err) {
      setError('Could not connect to backend');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading sessions...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="session-browser">
      <header className="browser-header">
        <h2>Recent Sessions</h2>
        <button onClick={fetchSessions} className="refresh-btn">Refresh</button>
      </header>

      <div className="session-list">
        {sessions.map(session => (
          <Link key={session.id} to={`/session/${session.id}`} className="session-item">
            <div className="session-info">
              <span className={`status-badge ${session.status.toLowerCase()}`}>{session.status}</span>
              <span className="session-type">{session.type}</span>
              <span className="session-time">{new Date(session.updatedAt).toLocaleString()}</span>
            </div>
            <div className="session-members">
              {session.relationship.members.map(m => (
                <span key={m.id} className="member-name">{m.user.firstName || m.user.email}</span>
              )).join(' & ')}
            </div>
          </Link>
        ))}
        {sessions.length === 0 && <div className="empty-state">No sessions found</div>}
      </div>
    </div>
  );
}

export default SessionBrowser;
