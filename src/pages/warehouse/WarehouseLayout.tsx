import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/warehouse', label: 'Dashboard', end: true },
  { to: '/warehouse/locations', label: 'Locations' },
  { to: '/warehouse/transfers', label: 'Transfers' },
  { to: '/warehouse/cycle-counts', label: 'Cycle Counts' },
  { to: '/warehouse/barcodes', label: 'Barcodes & Labels' },
];

export function WarehouseLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Warehouses &amp; Locations</h1>
          <p className="page-subtitle">Multi-location transfers, cycle counts &amp; barcodes (Phase 1I)</p>
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
