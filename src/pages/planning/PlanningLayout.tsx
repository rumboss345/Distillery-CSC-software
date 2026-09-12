import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/planning', label: 'Dashboard', end: true },
  { to: '/planning/demand', label: 'Demand' },
  { to: '/planning/production-plan', label: 'Production Plan' },
  { to: '/planning/mrp', label: 'MRP' },
  { to: '/planning/purchasing-recommendations', label: 'Purchasing Recommendations' },
  { to: '/planning/safety-stock', label: 'Safety Stock' },
  { to: '/planning/schedule', label: 'Schedule' },
];

export function PlanningLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Production Planning &amp; MRP</h1>
          <p className="page-subtitle">Demand forecasting, production plans, MRP &amp; schedule (Phase 1M)</p>
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
