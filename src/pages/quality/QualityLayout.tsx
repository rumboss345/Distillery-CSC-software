import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/quality', label: 'Dashboard', end: true },
  { to: '/quality/specifications', label: 'Specifications' },
  { to: '/quality/samples', label: 'QC Samples' },
  { to: '/quality/holds', label: 'Holds' },
  { to: '/quality/coa', label: 'COA' },
  { to: '/quality/recall', label: 'Recall Trace' },
];

export function QualityLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Quality (QA/QC)</h1>
          <p className="page-subtitle">Specifications, sampling, holds, internal COA &amp; recall traceability (Phase 1K)</p>
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
