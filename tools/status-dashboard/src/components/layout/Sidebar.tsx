import { NavLink } from 'react-router-dom';

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <NavLink to="/" className="sidebar-brand" end>
        <span className="pulse-dot" />
        <span className="sidebar-brand-text">Neural Monitor</span>
      </NavLink>

      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-nav-icon">{'\u25A6'}</span>
          <span className="sidebar-nav-label">Dashboard</span>
        </NavLink>

        <NavLink
          to="/sessions"
          className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-nav-icon">{'\u2630'}</span>
          <span className="sidebar-nav-label">Sessions</span>
        </NavLink>

        <NavLink
          to="/costs"
          className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-nav-icon">$</span>
          <span className="sidebar-nav-label">Costs</span>
        </NavLink>

        <NavLink
          to="/live"
          className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-nav-icon">{'\u25C9'}</span>
          <span className="sidebar-nav-label">Live</span>
        </NavLink>
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Recent</div>
      </div>
    </aside>
  );
}
