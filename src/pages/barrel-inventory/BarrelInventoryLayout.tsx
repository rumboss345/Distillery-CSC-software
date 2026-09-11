import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/barrels-inventory', label: 'Dashboard', end: true },
  { to: '/barrels-inventory/barrels', label: 'Barrel Master' },
  { to: '/barrels-inventory/fills', label: 'Fills' },
  { to: '/barrels-inventory/observations', label: 'Observations' },
  { to: '/barrels-inventory/dumps', label: 'Dumps' },
];

export function BarrelInventoryLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Barrel Aging</h1>
          <p className="page-subtitle">Barrel master, fills, observations &amp; maturation ledger (Phase 1J)</p>
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
