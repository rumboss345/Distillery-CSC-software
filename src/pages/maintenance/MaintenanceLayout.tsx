import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/maintenance', label: 'Dashboard', end: true },
  { to: '/maintenance/equipment', label: 'Equipment' },
  { to: '/maintenance/work-orders', label: 'Work Orders' },
  { to: '/maintenance/pm-schedules', label: 'PM Schedules' },
  { to: '/maintenance/downtime', label: 'Downtime' },
  { to: '/maintenance/calibration', label: 'Calibration' },
];

export function MaintenanceLayout() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Equipment Maintenance</h1>
          <p className="page-subtitle">Work orders, preventive maintenance, downtime &amp; calibration (Phase 1L)</p>
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
