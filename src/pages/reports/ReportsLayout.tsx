import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRefreshKey } from '../../db/queries';
import { ReportFilters } from '../../components/ReportFilters';
import { isOwnerRole } from '../../lib/roles';
import { ReportProvider, useReportContext } from './report-context';

function reportGroups(showOwnerCosting: boolean) {
  return [
    {
      label: 'Overview',
      tabs: [
        { to: '/reports', end: true as const, label: 'Summary' },
        ...(showOwnerCosting
          ? [
              { to: '/reports/costing' as const, label: 'Production costing' },
              { to: '/tools/batch-cost' as const, label: 'Home batch cost' },
            ]
          : []),
      ],
    },
    {
      label: 'Production',
      tabs: [
        { to: '/reports/wash', label: 'Wash' },
        { to: '/reports/fermentation', label: 'Fermentation' },
        { to: '/reports/distillation', label: 'Distillation' },
        { to: '/reports/blending', label: 'Blending' },
        { to: '/reports/bottling', label: 'Bottling' },
      ],
    },
    {
      label: 'Inventory & liquid',
      tabs: [
        { to: '/reports/tanks', label: 'Tanks' },
        { to: '/reports/movements', label: 'Movements' },
        { to: '/reports/volume-changes', label: 'Volume changes' },
      ],
    },
    {
      label: 'Quality & audit',
      tabs: [
        { to: '/reports/exceptions', label: 'Exceptions' },
        { to: '/reports/traceability', label: 'Traceability' },
      ],
    },
    {
      label: 'Facilities',
      tabs: [{ to: '/reports/maintenance', label: 'Maintenance' }],
    },
  ];
}

function ReportsLayoutInner() {
  const { user } = useAuth();
  const { key: sharedKey } = useRefreshKey();
  const showOwnerCosting = isOwnerRole(user?.role);
  const REPORT_GROUPS = reportGroups(showOwnerCosting);
  const {
    preset,
    customFrom,
    customTo,
    setPreset,
    setCustomFrom,
    setCustomTo,
    range,
    employeeKey,
    setEmployeeKey,
    employees,
    employee,
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
            employeeKey={employeeKey}
            employees={employees}
            onEmployeeChange={setEmployeeKey}
          />
        </div>
      </div>

      <p className="report-period-banner">
        Report period: <strong>{range.label}</strong>
        {range.from && range.to && range.from !== range.to && (
          <> ({range.from} – {range.to})</>
        )}
        {' · '}
        Employee: <strong>{employee ? employee.label : 'All employees'}</strong>
      </p>

      <nav className="reports-subnav" aria-label="Report sections">
        {REPORT_GROUPS.map((group) => (
          <div key={group.label} className="reports-subnav-group">
            <div className="reports-subnav-group-label">{group.label}</div>
            <div className="reports-subnav-group-links">
              {group.tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={'end' in tab ? tab.end : false}
                  className={({ isActive }) => `reports-subnav-link${isActive ? ' active' : ''}`}
                >
                  {tab.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <Outlet key={sharedKey} />
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
