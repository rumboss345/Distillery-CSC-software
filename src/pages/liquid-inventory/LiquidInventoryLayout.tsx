import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/liquid-inventory', label: 'Tank Board', end: true },
  { to: '/liquid-inventory/lots', label: 'Liquid Lots' },
  { to: '/liquid-inventory/transactions', label: 'Transactions' },
  { to: '/liquid-inventory/reconciliation', label: 'Reconciliation' },
];

export function LiquidInventoryLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Liquid Inventory</h1>
          <p className="page-subtitle">Transaction-ledger liquid tracking (Phase 1D)</p>
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
