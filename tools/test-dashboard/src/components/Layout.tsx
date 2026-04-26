import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-dot" />
          <h1>MWF Test Dashboard</h1>
        </div>
        <nav className="app-nav">
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
    </div>
  );
}
