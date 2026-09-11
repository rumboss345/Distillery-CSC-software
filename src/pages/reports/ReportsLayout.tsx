import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/reports', label: 'Executive Dashboard', end: true },
  { to: '/reports/production-kpis', label: 'Production KPIs' },
  { to: '/reports/inventory', label: 'Inventory' },
  { to: '/reports/purchasing', label: 'Purchasing' },
  { to: '/reports/barrels', label: 'Barrels' },
  { to: '/reports/costing', label: 'Costing' },
  { to: '/reports/legacy-production', label: 'Legacy Production' },
];

export function ReportsLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Management Dashboard &amp; Reports</h1>
          <p className="page-subtitle">
            Executive KPIs and ledger-authoritative inventory analytics (Phase 1O)
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
