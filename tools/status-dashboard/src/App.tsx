
import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import SessionBrowser from './components/SessionBrowser';
import SessionDetail from './components/SessionDetail';

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
        </Routes>
      </main>
    </div>
  );
}

export default App;
