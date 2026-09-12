/**
 * Phase 1L Equipment Maintenance, PM & Downtime.
 */

export const MAINTENANCE_FLOOR_EQUIPMENT_COLUMNS: Array<{ column: string; ddl: string }> = [
  { column: 'asset_number', ddl: `ALTER TABLE floor_equipment ADD COLUMN asset_number TEXT` },
  { column: 'manufacturer', ddl: `ALTER TABLE floor_equipment ADD COLUMN manufacturer TEXT` },
  { column: 'model', ddl: `ALTER TABLE floor_equipment ADD COLUMN model TEXT` },
  { column: 'serial_number', ddl: `ALTER TABLE floor_equipment ADD COLUMN serial_number TEXT` },
  { column: 'commission_date', ddl: `ALTER TABLE floor_equipment ADD COLUMN commission_date TEXT` },
  { column: 'criticality', ddl: `ALTER TABLE floor_equipment ADD COLUMN criticality TEXT` },
  { column: 'maint_status', ddl: `ALTER TABLE floor_equipment ADD COLUMN maint_status TEXT DEFAULT 'Active'` },
  { column: 'service_provider', ddl: `ALTER TABLE floor_equipment ADD COLUMN service_provider TEXT` },
  { column: 'last_calibration_date', ddl: `ALTER TABLE floor_equipment ADD COLUMN last_calibration_date TEXT` },
  { column: 'next_calibration_due', ddl: `ALTER TABLE floor_equipment ADD COLUMN next_calibration_due TEXT` },
  { column: 'calibration_certificate_ref', ddl: `ALTER TABLE floor_equipment ADD COLUMN calibration_certificate_ref TEXT` },
];

export const MAINTENANCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS maint_pm_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_code TEXT NOT NULL UNIQUE,
  floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  work_type TEXT NOT NULL DEFAULT 'Preventive',
  frequency_value INTEGER NOT NULL,
  frequency_unit TEXT NOT NULL,
  last_completed_date TEXT,
  next_due_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_maint_pm_equipment ON maint_pm_schedules(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_pm_next_due ON maint_pm_schedules(next_due_date);

CREATE TABLE IF NOT EXISTS maint_work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_code TEXT NOT NULL UNIQUE,
  floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  pm_schedule_id INTEGER REFERENCES maint_pm_schedules(id) ON DELETE SET NULL,
  work_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scheduled_date TEXT,
  started_at TEXT,
  completed_at TEXT,
  assigned_to TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_maint_wo_equipment ON maint_work_orders(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_wo_status ON maint_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_maint_wo_pm ON maint_work_orders(pm_schedule_id);

CREATE TABLE IF NOT EXISTS maint_downtime_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  downtime_code TEXT NOT NULL UNIQUE,
  floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  work_order_id INTEGER REFERENCES maint_work_orders(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reason TEXT NOT NULL,
  production_impact TEXT NOT NULL DEFAULT 'None',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_maint_downtime_equipment ON maint_downtime_records(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_downtime_active ON maint_downtime_records(ended_at);
`;

export const MAINTENANCE_V1L_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_maint_pm_equipment ON maint_pm_schedules(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_wo_equipment ON maint_work_orders(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_downtime_equipment ON maint_downtime_records(floor_equipment_id);
`;

export const MAINTENANCE_V1L_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
