import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/costing', label: 'Dashboard', end: true },
  { to: '/costing/landed-costs', label: 'Landed Costs' },
  { to: '/costing/material-valuation', label: 'Material Valuation' },
  { to: '/costing/liquid-valuation', label: 'Liquid Valuation' },
  { to: '/costing/batch-costing', label: 'Batch Costing' },
  { to: '/costing/adjustments', label: 'Adjustments' },
];

export function CostingLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Costing</h1>
          <p className="page-subtitle">Operational costing, landed cost allocation &amp; COGS foundation (Phase 1G)</p>
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
