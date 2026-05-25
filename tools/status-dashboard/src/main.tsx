
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './style.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Root() {
  const router = (
    <BrowserRouter basename={import.meta.env.PROD && !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? '/monitor' : '/'}>
      <App />
    </BrowserRouter>
  );

  if (!clerkPublishableKey) return router;

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {router}
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
