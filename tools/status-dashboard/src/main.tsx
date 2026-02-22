
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './style.css';

function Root() {
  return (
    <BrowserRouter basename={import.meta.env.PROD && !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? '/monitor' : '/'}>
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
