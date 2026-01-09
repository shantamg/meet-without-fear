
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Ably from 'ably';
import { Session } from '../types';

const ablyKey = import.meta.env.VITE_ABLY_KEY;

function SessionBrowser() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ablyStatus, setAblyStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');

  useEffect(() => {
    fetchSessions();

    // Subscribe to Ably for real-time session updates
    if (!ablyKey) {
      console.warn('VITE_ABLY_KEY not set - live updates disabled');
      return;
    }

    const client = new Ably.Realtime(ablyKey);
    const channel = client.channels.get('ai-audit-stream');

    client.connection.on('connected', () => setAblyStatus('connected'));
    client.connection.on('disconnected', () => setAblyStatus('disconnected'));
    client.connection.on('failed', () => setAblyStatus('error'));

    // Listen for new session events
    channel.subscribe('session-created', () => {
      // Refetch sessions when a new one is created
      fetchSessions();
    });

    return () => {
      channel.unsubscribe();
      client.close();
    };
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/audit/sessions');
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
        <div className="header-left">
          <h2>Recent Sessions</h2>
          <span className={`connection-status ${ablyStatus}`}>
            {ablyStatus === 'connected' ? '● Live' : '○ Offline'}
          </span>
        </div>
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
              {session.relationship.members.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ' & '}
                  <span className="member-name">{m.user.firstName || m.user.email}</span>
                </span>
              ))}
            </div>
          </Link>
        ))}
        {sessions.length === 0 && <div className="empty-state">No sessions found</div>}
      </div>
    </div>
  );
}

export default SessionBrowser;
