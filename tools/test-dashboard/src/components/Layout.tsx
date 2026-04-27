import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-dot" aria-hidden="true" />
          <h1>MWF Test Dashboard</h1>
          <span className="env-tag" title="Phase 1A — read-only baseline">
            phase 1a
          </span>
        </div>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to="/" end>
            Runs
          </NavLink>
          <NavLink to="/snapshots">Snapshots</NavLink>
          <NavLink to="/new-run">New Run</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>mwf-test-dashboard</span>
        <span>·</span>
        <a
          href="https://github.com/shantamg/meet-without-fear/blob/main/.planning/TEST_DASHBOARD_PLAN.md"
          target="_blank"
          rel="noreferrer"
        >
          plan
        </a>
        <span>·</span>
        <a
          href="https://github.com/shantamg/meet-without-fear/tree/main/tools/test-dashboard"
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>
      </footer>
    </div>
  );
}
