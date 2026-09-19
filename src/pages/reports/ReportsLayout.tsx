import { NavLink, Outlet } from 'react-router-dom';
import { ReportFilters } from '../../components/ReportFilters';
import { ReportProvider, useReportContext } from './report-context';

const TABS = [
  { to: '/reports', end: true, label: 'Summary' },
  { to: '/reports/distillation', label: 'Distillation' },
  { to: '/reports/tanks', label: 'Tanks' },
  { to: '/reports/blending', label: 'Blending' },
  { to: '/reports/bottling', label: 'Bottling' },
  { to: '/reports/movements', label: 'Movements' },
  { to: '/reports/exceptions', label: 'Exceptions' },
  { to: '/reports/traceability', label: 'Traceability' },
];

function ReportsLayoutInner() {
  const {
    preset,
    customFrom,
    customTo,
    setPreset,
    setCustomFrom,
    setCustomTo,
    range,
  } = useReportContext();

  return (
    <div>
      <div className="page-header">
        <h2>Production Reports</h2>
        <p>Operational reporting derived from production records (no separate ledger).</p>
        <div className="page-actions report-filters">
          <ReportFilters
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onPresetChange={setPreset}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        </div>
      </div>

      <p className="report-period-banner">
        Report period: <strong>{range.label}</strong>
        {range.from && range.to && range.from !== range.to && (
          <> ({range.from} – {range.to})</>
        )}
      </p>

      <nav className="reports-subnav" aria-label="Report sections">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `reports-subnav-link${isActive ? ' active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}

export function ReportsLayout() {
  return (
    <ReportProvider>
      <ReportsLayoutInner />
    </ReportProvider>
  );
}
