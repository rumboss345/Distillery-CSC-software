import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/finished-goods', label: 'Dashboard', end: true },
  { to: '/finished-goods/inventory', label: 'Inventory' },
  { to: '/finished-goods/lots', label: 'Lots' },
  { to: '/finished-goods/packaging-runs', label: 'Packaging Runs' },
  { to: '/finished-goods/transactions', label: 'Transactions' },
];

export function FinishedGoodsLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Finished Goods</h1>
          <p className="page-subtitle">Packaging runs, FG lots &amp; warehouse ledger (Phase 1H)</p>
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
