import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/mash', label: 'Mash & Ferment', icon: '◉' },
  { to: '/distillation', label: 'Distillation', icon: '△' },
  { to: '/blending', label: 'Blending', icon: '◆' },
  { to: '/barrels', label: 'Barrel Aging', icon: '▣' },
  { to: '/bottling', label: 'Bottling', icon: '◇' },
  { to: '/floor-plan', label: 'Floor Plan', icon: '▦' },
  { to: '/inventory', label: 'Inventory', icon: '☰' },
  { to: '/reports', label: 'Reports', icon: '▤' },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>CSC Distillery Tracker</h1>
          <p>Production management</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              <span className="nav-icon">✉</span>
              User approvals
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-email">{user?.email}</span>
            {user?.role === 'admin' && <span className="sidebar-user-role">Admin</span>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm sidebar-logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
