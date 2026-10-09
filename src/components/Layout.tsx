import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dismissSharedNotice, getSharedNotice, subscribeSharedNotice } from '../db/database';
import type { PermissionKey } from '../lib/permissions';

type NavItem = { to: string; label: string; icon: string; permission: PermissionKey };

const navGroups: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: 'production',
    label: 'Production',
    items: [
      { to: '/', label: 'Dashboard', icon: '◈', permission: 'dashboard' },
      { to: '/calendar', label: 'Calendar', icon: '▧', permission: 'dashboard' },
      { to: '/floor-plan', label: 'Equipment', icon: '▦', permission: 'equipment' },
    ],
  },
  {
    id: 'make',
    label: 'Make',
    items: [
      { to: '/wash', label: 'Wash', icon: '◉', permission: 'wash' },
      { to: '/fermentation', label: 'Fermentation', icon: '◌', permission: 'wash' },
      { to: '/distillation', label: 'Distillation', icon: '△', permission: 'distillation' },
      { to: '/tank-transfer', label: 'Tank Transfer', icon: '⇄', permission: 'distillation' },
    ],
  },
  {
    id: 'finish',
    label: 'Finish',
    items: [
      { to: '/blending', label: 'Blending', icon: '◆', permission: 'blending' },
      { to: '/tools/spirit-calculator', label: 'Spirit Calculator', icon: '⚖', permission: 'blending' },
      { to: '/barrels', label: 'Barrel Aging', icon: '▣', permission: 'barrels' },
      { to: '/bottling', label: 'Bottling', icon: '◇', permission: 'bottling' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    items: [
      { to: '/inventory', label: 'Inventory', icon: '☰', permission: 'inventory' },
      { to: '/recipes', label: 'Recipes', icon: '◎', permission: 'wash' },
      { to: '/equipment-maintenance', label: 'Equipment Maintenance', icon: '🔧', permission: 'equipment' },
      { to: '/reports', label: 'Reports', icon: '▤', permission: 'reports' },
    ],
  },
];

function navItemVisible(item: NavItem, hasPermission: (key: PermissionKey) => boolean): boolean {
  if (item.to === '/recipes') {
    return hasPermission('wash') || hasPermission('blending');
  }
  return hasPermission(item.permission);
}

function currentPageLabel(pathname: string, groups: { items: NavItem[] }[], isAdmin: boolean): string {
  if (isAdmin && pathname.startsWith('/admin')) return 'Administration';
  const items = groups.flatMap((group) => group.items);
  const match = items
    .filter((item) => (
      item.to === '/'
        ? pathname === '/'
        : pathname === item.to || pathname.startsWith(`${item.to}/`)
    ))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? 'CSC Distillery';
}

export function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const sharedNotice = useSyncExternalStore(subscribeSharedNotice, getSharedNotice, () => null);

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => navItemVisible(item, hasPermission)),
    }))
    .filter((group) => group.items.length > 0);

  const pageLabel = currentPageLabel(location.pathname, visibleGroups, user?.role === 'admin');

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
    return () => document.body.classList.remove('nav-open');
  }, [navOpen]);

  return (
    <div className={`app-layout${navOpen ? ' app-layout--nav-open' : ''}`}>
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          onClick={() => setNavOpen((open) => !open)}
        >
          <span className="mobile-menu-icon" aria-hidden="true" />
          Menu
        </button>
        <div className="mobile-topbar-title">{pageLabel}</div>
      </header>
      {navOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside id="app-sidebar" className={`sidebar${navOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-brand">
          <h1>CSC Distillery Tracker</h1>
          <p>Production management</p>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            Close
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {visibleGroups.map((group) => (
            <div key={group.id} className="nav-group" role="group" aria-labelledby={`nav-group-${group.id}`}>
              <div id={`nav-group-${group.id}`} className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
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
            </div>
          ))}
          {user?.role === 'admin' && (
            <div className="nav-group" role="group" aria-labelledby="nav-group-admin">
              <div id="nav-group-admin" className="nav-group-label">Admin</div>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                <span className="nav-icon">⚙</span>
                Administration
              </NavLink>
            </div>
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
        {sharedNotice && (
          <div className="shared-record-notice" role="status">
            <span>{sharedNotice}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismissSharedNotice}>
              Dismiss
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
