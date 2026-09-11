import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/production', label: 'Orders', end: true },
];

export function ProductionLayout() {
  return (
    <div>
      <div className="page-header">
        <h1>Production</h1>
        <p className="page-subtitle">Production orders and batch execution</p>
      </div>
      <nav className="tab-nav" style={{ marginBottom: '1rem' }}>
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
