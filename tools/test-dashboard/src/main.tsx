import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './style.css';

// NOTE: No Clerk wrapper for Phase 1A.
// Add ClerkProvider here (with VITE_CLERK_PUBLISHABLE_KEY) before sharing with Darryl.

const rootEl = document.getElementById('app');
if (!rootEl) {
  throw new Error('Root element #app not found');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
