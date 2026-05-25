import React, { Suspense } from 'react';
import { RedirectToSignIn, SignedIn, SignedOut, useAuth } from '@clerk/clerk-react';
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import SessionDetail from './components/session/SessionDetail';
import { ContextPage } from './components/context';
import { SessionListPage } from './pages/SessionListPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setAuthTokenProvider } from './services/api';

// Lazy-loaded pages (less frequently visited)
const DashboardPage = React.lazy(() =>
  import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage }))
);
const CostAnalysisPage = React.lazy(() =>
  import('./pages/CostAnalysisPage').then(m => ({ default: m.CostAnalysisPage }))
);
const LiveMonitorPage = React.lazy(() =>
  import('./pages/LiveMonitorPage').then(m => ({ default: m.LiveMonitorPage }))
);
const PromptInspectorPage = React.lazy(() =>
  import('./pages/PromptInspectorPage').then(m => ({ default: m.PromptInspectorPage }))
);

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'var(--text-secondary)' }}>
      <span className="spinner" style={{ marginRight: '8px' }}>↻</span>
      Loading...
    </div>
  );
}

function PageErrorFallback() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Something went wrong</h3>
      <p>An error occurred loading this page.</p>
      <a href="/" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Go to Dashboard</a>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ErrorBoundary fallback={<PageErrorFallback />}><Suspense fallback={<LoadingSpinner />}><DashboardPage /></Suspense></ErrorBoundary>} />
        <Route path="/sessions" element={<ErrorBoundary fallback={<PageErrorFallback />}><SessionListPage /></ErrorBoundary>} />
        <Route path="/sessions/:sessionId" element={<ErrorBoundary fallback={<PageErrorFallback />}><SessionDetail /></ErrorBoundary>} />
        <Route path="/sessions/:sessionId/context" element={<ErrorBoundary fallback={<PageErrorFallback />}><ContextPage /></ErrorBoundary>} />
        <Route path="/sessions/:sessionId/prompt/:activityId" element={<ErrorBoundary fallback={<PageErrorFallback />}><Suspense fallback={<LoadingSpinner />}><PromptInspectorPage /></Suspense></ErrorBoundary>} />
        <Route path="/costs" element={<ErrorBoundary fallback={<PageErrorFallback />}><Suspense fallback={<LoadingSpinner />}><CostAnalysisPage /></Suspense></ErrorBoundary>} />
        <Route path="/live" element={<ErrorBoundary fallback={<PageErrorFallback />}><Suspense fallback={<LoadingSpinner />}><LiveMonitorPage /></Suspense></ErrorBoundary>} />
      </Route>
    </Routes>
  );
}

function ClerkGate() {
  const { getToken, isLoaded } = useAuth();
  const [authProviderReady, setAuthProviderReady] = React.useState(false);

  React.useLayoutEffect(() => {
    setAuthTokenProvider(() => getToken());
    setAuthProviderReady(true);

    return () => {
      setAuthTokenProvider(null);
      setAuthProviderReady(false);
    };
  }, [getToken]);

  if (!isLoaded || !authProviderReady) return <LoadingSpinner />;

  return (
    <>
      <SignedIn>
        <AppRoutes />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function App() {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return <AppRoutes />;
  return <ClerkGate />;
}

export default App;
