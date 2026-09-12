import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/administration', label: 'Dashboard', end: true },
  { to: '/administration/users', label: 'Users & Roles' },
  { to: '/administration/audit-log', label: 'Audit Log' },
  { to: '/administration/documents', label: 'Documents' },
];

export function AdministrationLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Administration</h1>
          <p className="page-subtitle">
            Permissions, audit trail &amp; document metadata (Phase 1P — browser-local)
          </p>
        </div>
      </header>
      <nav className="tab-nav">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `tab-link${isActive ? ' active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
