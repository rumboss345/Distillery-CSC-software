import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/accounting', label: 'Dashboard', end: true },
  { to: '/accounting/mappings', label: 'Account Mappings' },
  { to: '/accounting/events', label: 'Staging Events' },
  { to: '/accounting/exports', label: 'Export Batches' },
];

export function AccountingLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Accounting Integration</h1>
          <p className="page-subtitle">
            QuickBooks handoff foundation — configurable mappings, staging events &amp; CSV/JSON export (Phase 1Q)
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
