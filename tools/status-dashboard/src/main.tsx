
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import App from './App';
import { AuthSetup } from './components/AuthSetup';
import './style.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Root() {
  const router = (
    <BrowserRouter basename={import.meta.env.PROD && import.meta.env.VITE_DEPLOY_TARGET !== 'vercel' ? '/monitor' : '/'}>
      <App />
    </BrowserRouter>
  );

  if (!clerkPubKey) {
    return router;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#6366f1',
          colorBackground: '#171717',
          colorInputBackground: '#262626',
          colorInputText: '#e5e5e5',
        },
      }}
    >
      <AuthSetup />
      {router}
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
