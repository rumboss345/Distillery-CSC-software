import {
  EQUIPMENT_MAINTENANCE_LOG_EVENT_LABELS,
  MAINTENANCE_REPORT_STATUS_GROUPS,
} from '../../lib/equipment-maintenance-log';

export interface MaintenanceLogFilterState {
  from: string;
  to: string;
  /** `all` or a maintenance report status key (see maintenanceReportStatusKey). */
  eventKey: string;
}

export const EMPTY_MAINTENANCE_LOG_FILTER: MaintenanceLogFilterState = {
  from: '',
  to: '',
  eventKey: 'all',
};

export function maintenanceLogFilterActive(filter: MaintenanceLogFilterState): boolean {
  return Boolean(filter.from.trim() || filter.to.trim() || filter.eventKey !== 'all');
}

interface MaintenanceLogFilterBarProps {
  filter: MaintenanceLogFilterState;
  onChange: (next: MaintenanceLogFilterState) => void;
  onClear: () => void;
  idPrefix?: string;
}

export function MaintenanceLogFilterBar({
  filter,
  onChange,
  onClear,
  idPrefix = 'maintenance-log-filter',
}: MaintenanceLogFilterBarProps) {
  const active = maintenanceLogFilterActive(filter);
  return (
    <div className="maintenance-log-filters form-grid" data-testid="maintenance-log-filters">
      <div className="form-group">
        <label htmlFor={`${idPrefix}-from`}>From</label>
        <input
          id={`${idPrefix}-from`}
          type="date"
          value={filter.from}
          onChange={(e) => onChange({ ...filter, from: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`${idPrefix}-to`}>To</label>
        <input
          id={`${idPrefix}-to`}
          type="date"
          value={filter.to}
          onChange={(e) => onChange({ ...filter, to: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label htmlFor={`${idPrefix}-event`}>Event</label>
        <select
          id={`${idPrefix}-event`}
          value={filter.eventKey}
          onChange={(e) => onChange({ ...filter, eventKey: e.target.value })}
        >
          <option value="all">All events</option>
          <optgroup label="Cleaning">
            {(['needs_cleaning', 'marked_cleaned'] as const).map((key) => (
              <option key={key} value={key}>
                {EQUIPMENT_MAINTENANCE_LOG_EVENT_LABELS[key]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Maintenance">
            {MAINTENANCE_REPORT_STATUS_GROUPS.filter((g) =>
              !['needs_cleaning', 'marked_cleaned'].includes(g.key),
            ).map((group) => (
              <option key={group.key} value={group.key}>
                {group.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="form-group maintenance-log-filters-actions">
        <span className="field-hint" aria-hidden="true">&nbsp;</span>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={!active}
          onClick={onClear}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}