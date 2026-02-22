import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

const MOBILE_BREAKPOINT = 768;

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (isMobile) {
    return (
      <nav className="bottom-tabs">
        <NavLink to="/" end className={({ isActive }) => `bottom-tab${isActive ? ' active' : ''}`}>
          <span className="bottom-tab-icon">{'\u25A6'}</span>
          <span className="bottom-tab-label">Dashboard</span>
        </NavLink>
        <NavLink to="/sessions" className={({ isActive }) => `bottom-tab${isActive ? ' active' : ''}`}>
          <span className="bottom-tab-icon">{'\u2630'}</span>
          <span className="bottom-tab-label">Sessions</span>
        </NavLink>
        <NavLink to="/costs" className={({ isActive }) => `bottom-tab${isActive ? ' active' : ''}`}>
          <span className="bottom-tab-icon">$</span>
          <span className="bottom-tab-label">Costs</span>
        </NavLink>
        <NavLink to="/live" className={({ isActive }) => `bottom-tab${isActive ? ' active' : ''}`}>
          <span className="bottom-tab-icon">{'\u25C9'}</span>
          <span className="bottom-tab-label">Live</span>
        </NavLink>
      </nav>
    );
  }

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
