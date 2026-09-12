import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { PermissionKey } from '../lib/permissions';

const navItems: { to: string; label: string; icon: string; permission: PermissionKey }[] = [
  { to: '/', label: 'Dashboard', icon: '◈', permission: 'dashboard' },
  { to: '/wash', label: 'Wash & Ferment', icon: '◉', permission: 'wash' },
  { to: '/recipes', label: 'Recipes', icon: '◎', permission: 'wash' },
  { to: '/distillation', label: 'Distillation', icon: '△', permission: 'distillation' },
  { to: '/blending', label: 'Blending', icon: '◆', permission: 'blending' },
  { to: '/barrels', label: 'Barrel Aging', icon: '▣', permission: 'barrels' },
  { to: '/bottling', label: 'Bottling', icon: '◇', permission: 'bottling' },
  { to: '/floor-plan', label: 'Equipment', icon: '▦', permission: 'equipment' },
  { to: '/inventory', label: 'Inventory', icon: '☰', permission: 'inventory' },
  { to: '/reports', label: 'Reports', icon: '▤', permission: 'reports' },
];

export function Layout() {
  const { user, logout, hasPermission } = useAuth();

  const visibleNav = navItems.filter((item) => hasPermission(item.permission));

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>CSC Distillery Tracker</h1>
          <p>Production management</p>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map((item) => (
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
              <span className="nav-icon">⚙</span>
              Administration
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
