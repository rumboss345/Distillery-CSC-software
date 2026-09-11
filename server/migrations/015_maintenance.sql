-- Phase 1L Equipment Maintenance, PM & Downtime.

ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS asset_number TEXT;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS commission_date DATE;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS criticality TEXT;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS maint_status TEXT DEFAULT 'Active';
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS service_provider TEXT;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS last_calibration_date DATE;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS next_calibration_due DATE;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS calibration_certificate_ref TEXT;

CREATE TABLE IF NOT EXISTS maint_pm_schedules (
  id BIGSERIAL PRIMARY KEY,
  schedule_code TEXT NOT NULL UNIQUE,
  floor_equipment_id BIGINT NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  work_type TEXT NOT NULL DEFAULT 'Preventive',
  frequency_value INTEGER NOT NULL,
  frequency_unit TEXT NOT NULL,
  last_completed_date DATE,
  next_due_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maint_pm_equipment ON maint_pm_schedules(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_pm_next_due ON maint_pm_schedules(next_due_date);

CREATE TABLE IF NOT EXISTS maint_work_orders (
  id BIGSERIAL PRIMARY KEY,
  work_order_code TEXT NOT NULL UNIQUE,
  floor_equipment_id BIGINT NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  pm_schedule_id BIGINT REFERENCES maint_pm_schedules(id) ON DELETE SET NULL,
  work_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scheduled_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maint_wo_equipment ON maint_work_orders(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_wo_status ON maint_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_maint_wo_pm ON maint_work_orders(pm_schedule_id);

CREATE TABLE IF NOT EXISTS maint_downtime_records (
  id BIGSERIAL PRIMARY KEY,
  downtime_code TEXT NOT NULL UNIQUE,
  floor_equipment_id BIGINT NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  work_order_id BIGINT REFERENCES maint_work_orders(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  production_impact TEXT NOT NULL DEFAULT 'None',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maint_downtime_equipment ON maint_downtime_records(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_downtime_active ON maint_downtime_records(ended_at);
