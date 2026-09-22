import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { PermissionKey } from '../lib/permissions';

const navItems: { to: string; label: string; icon: string; permission: PermissionKey }[] = [
  { to: '/', label: 'Dashboard', icon: '◈', permission: 'dashboard' },
  { to: '/calendar', label: 'Calendar', icon: '▧', permission: 'dashboard' },
  { to: '/floor-plan', label: 'Equipment', icon: '▦', permission: 'equipment' },
  { to: '/wash', label: 'Wash & Ferment', icon: '◉', permission: 'wash' },
  { to: '/distillation', label: 'Distillation', icon: '△', permission: 'distillation' },
  { to: '/tank-transfer', label: 'Tank Transfer', icon: '⇄', permission: 'distillation' },
  { to: '/blending', label: 'Blending', icon: '◆', permission: 'blending' },
  { to: '/tools/spirit-calculator', label: 'Spirit Calculator', icon: '⚖', permission: 'blending' },
  { to: '/barrels', label: 'Barrel Aging', icon: '▣', permission: 'barrels' },
  { to: '/bottling', label: 'Bottling', icon: '◇', permission: 'bottling' },
  { to: '/inventory', label: 'Inventory', icon: '☰', permission: 'inventory' },
  { to: '/recipes', label: 'Recipes', icon: '◎', permission: 'wash' },
  { to: '/equipment-maintenance', label: 'Equipment Maintenance', icon: '🔧', permission: 'equipment' },
  { to: '/reports', label: 'Reports', icon: '▤', permission: 'reports' },
];

export function Layout() {
  const { user, logout, hasPermission } = useAuth();

  const visibleNav = navItems.filter((item) => {
    if (item.to === '/recipes') {
      return hasPermission('wash') || hasPermission('blending');
    }
    return hasPermission(item.permission);
  });

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
          <NavLink
            to="/ask-nelly"
            className={({ isActive }) =>
              `nav-link${isActive ? ' active' : ''}`
            }
          >
            <span className="nav-icon">💬</span>
            Ask Nelly
          </NavLink>
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
