import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import SessionDetail from './components/session/SessionDetail';
import { ContextPage } from './components/context';
import { DashboardPage } from './pages/DashboardPage';
import { SessionListPage } from './pages/SessionListPage';
import { CostAnalysisPage } from './pages/CostAnalysisPage';
import { LiveMonitorPage } from './pages/LiveMonitorPage';
import { PromptInspectorPage } from './pages/PromptInspectorPage';

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sessions" element={<SessionListPage />} />
        <Route path="/sessions/:sessionId" element={<SessionDetail />} />
        <Route path="/sessions/:sessionId/context" element={<ContextPage />} />
        <Route path="/sessions/:sessionId/prompt/:activityId" element={<PromptInspectorPage />} />
        <Route path="/costs" element={<CostAnalysisPage />} />
        <Route path="/live" element={<LiveMonitorPage />} />
      </Route>
    </Routes>
  );
}

export default App;
