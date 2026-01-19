import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { SessionBrowser } from './components/browser';
import SessionDetail from './components/session/SessionDetail';
import { ContextPage } from './components/context';

function App() {
  return (
    <div className="app-container">
      <nav className="main-nav">
        <Link to="/" className="nav-brand">
          <span className="pulse-dot"></span>
          <h1>Neural Monitor</h1>
        </Link>
        <div className="nav-links">
          <Link to="/">Sessions</Link>
        </div>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<SessionBrowser />} />
          <Route path="/session/:sessionId" element={<SessionDetail />} />
          <Route path="/session/:sessionId/context" element={<ContextPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
