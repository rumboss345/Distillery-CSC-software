import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/sales', label: 'Dashboard', end: true },
  { to: '/sales/customers', label: 'Customers' },
  { to: '/sales/orders', label: 'Sales Orders' },
  { to: '/sales/shipments', label: 'Shipments' },
  { to: '/sales/returns', label: 'Returns' },
  { to: '/sales/analytics', label: 'Depletion Analytics' },
];

export function SalesLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Sales &amp; Depletions</h1>
          <p className="page-subtitle">
            Customers, sales orders, shipments, returns &amp; operational COGS (Phase 1N)
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
