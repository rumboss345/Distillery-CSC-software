import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/purchasing', label: 'Purchase Orders', end: true },
  { to: '/purchasing/receipts', label: 'Receipts' },
];

export function PurchasingLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Purchasing</h1>
          <p className="page-subtitle">Purchase orders and goods receipt (Phase 1F)</p>
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
