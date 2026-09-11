import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ProductionDatabaseBanner } from './ProductionDatabaseBanner';
import { useAuth } from '../context/AuthContext';
import { fetchProductionStatus } from '../lib/production-api';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/wash', label: 'Wash & Ferment', icon: '◉' },
  { to: '/distillation', label: 'Distillation', icon: '△' },
  { to: '/blending', label: 'Blending', icon: '◆' },
  { to: '/barrels-inventory', label: 'Barrel Aging', icon: '▣' },
  { to: '/bottling', label: 'Bottling', icon: '◇' },
  { to: '/floor-plan', label: 'Floor Plan', icon: '▦' },
  { to: '/inventory', label: 'Inventory', icon: '☰' },
  { to: '/material-inventory', label: 'Material Inventory', icon: '▤' },
  { to: '/liquid-inventory', label: 'Liquid Inventory', icon: '◐' },
  { to: '/purchasing', label: 'Purchasing', icon: '◧' },
  { to: '/costing', label: 'Costing', icon: '◈' },
  { to: '/finished-goods', label: 'Finished Goods', icon: '◫' },
  { to: '/quality', label: 'Quality (QA/QC)', icon: '◉' },
  { to: '/production', label: 'Production', icon: '◷' },
  { to: '/recipes', label: 'Recipes', icon: '◎' },
  { to: '/master-data', label: 'Master Data', icon: '◫' },
  { to: '/reports', label: 'Reports', icon: '▤' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [postgresConfigured, setPostgresConfigured] = useState(false);

  useEffect(() => {
    fetchProductionStatus()
      .then((status) => setPostgresConfigured(status.databaseConfigured))
      .catch(() => setPostgresConfigured(false));
  }, []);

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
            <>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                <span className="nav-icon">✉</span>
                User approvals
              </NavLink>
              {postgresConfigured && (
                <NavLink
                  to="/admin/data-migration"
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' active' : ''}`
                  }
                >
                  <span className="nav-icon">⇄</span>
                  Data migration
                </NavLink>
              )}
            </>
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
        <ProductionDatabaseBanner />
        <Outlet />
      </main>
    </div>
  );
}
