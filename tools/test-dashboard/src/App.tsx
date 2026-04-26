import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RunsFeedPage } from './pages/RunsFeedPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { SnapshotsTreePage } from './pages/SnapshotsTreePage';
import { SnapshotDetailPage } from './pages/SnapshotDetailPage';
import { NewRunPage } from './pages/NewRunPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<RunsFeedPage />} />
        <Route path="/run/:id" element={<RunDetailPage />} />
        <Route path="/snapshots" element={<SnapshotsTreePage />} />
        <Route path="/snapshot/:id" element={<SnapshotDetailPage />} />
        <Route path="/new-run" element={<NewRunPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
