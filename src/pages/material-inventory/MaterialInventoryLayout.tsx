import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/material-inventory', label: 'Dashboard', end: true },
  { to: '/material-inventory/raw-materials', label: 'Raw Materials' },
  { to: '/material-inventory/packaging', label: 'Packaging' },
  { to: '/material-inventory/opening-balance', label: 'Opening Balance' },
  { to: '/material-inventory/lots', label: 'Lots' },
  { to: '/material-inventory/transactions', label: 'Transactions' },
  { to: '/material-inventory/reconciliation', label: 'Reconciliation' },
];

export function MaterialInventoryLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Material Inventory</h1>
          <p className="page-subtitle">Transaction-ledger raw &amp; packaging tracking (Phase 1F)</p>
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
