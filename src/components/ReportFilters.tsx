import { ALL_EMPLOYEES_KEY, type ReportEmployee } from '../lib/reporting/person';
import type { ReportPeriodPreset } from '../lib/reporting/period';

export interface ReportFiltersProps {
  preset: ReportPeriodPreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: ReportPeriodPreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  employeeKey: string;
  employees: ReportEmployee[];
  onEmployeeChange: (key: string) => void;
}

const PRESETS: { value: ReportPeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

export function ReportFilters({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  employeeKey,
  employees,
  onEmployeeChange,
}: ReportFiltersProps) {
  return (
    <div className="report-filters-panel">
      <div className="form-group report-employee-filter">
        <label htmlFor="report-employee">Employee</label>
        <select
          id="report-employee"
          value={employeeKey}
          onChange={(e) => onEmployeeChange(e.target.value)}
        >
          <option value={ALL_EMPLOYEES_KEY}>All employees</option>
          {employees.map((employee) => (
            <option key={employee.key} value={employee.key}>
              {employee.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group report-period-preset">
        <label htmlFor="report-period-preset">Period</label>
        <select
          id="report-period-preset"
          value={preset}
          onChange={(e) => onPresetChange(e.target.value as ReportPeriodPreset)}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {preset === 'custom' && (
        <>
          <div className="form-group">
            <label htmlFor="report-from">From</label>
            <input
              id="report-from"
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="report-to">To</label>
            <input
              id="report-to"
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
