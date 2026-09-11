/**
 * Phase 1M Production Planning, Demand Forecasting & MRP.
 */

export const PLANNING_SCHEMA = `
CREATE TABLE IF NOT EXISTS plan_demand_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'weekly',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_demand_forecast_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_id INTEGER NOT NULL REFERENCES plan_demand_forecasts(id) ON DELETE CASCADE,
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  demand_quantity REAL NOT NULL,
  quantity_unit TEXT NOT NULL DEFAULT 'units',
  period_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_plan_demand_lines_forecast ON plan_demand_forecast_lines(forecast_id);
CREATE INDEX IF NOT EXISTS idx_plan_demand_lines_sku ON plan_demand_forecast_lines(sku_id);

CREATE TABLE IF NOT EXISTS plan_production_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan_start TEXT NOT NULL,
  plan_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  linked_forecast_id INTEGER REFERENCES plan_demand_forecasts(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_production_plan_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_plan_id INTEGER NOT NULL REFERENCES plan_production_plans(id) ON DELETE CASCADE,
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  recipe_id INTEGER REFERENCES rc_recipes(id),
  recipe_version_id INTEGER REFERENCES rc_recipe_versions(id),
  planned_quantity REAL NOT NULL,
  quantity_unit TEXT NOT NULL DEFAULT 'units',
  planned_start TEXT,
  planned_end TEXT,
  floor_equipment_id INTEGER REFERENCES floor_equipment(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_plan_prod_lines_plan ON plan_production_plan_lines(production_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_prod_lines_sku ON plan_production_plan_lines(sku_id);

CREATE TABLE IF NOT EXISTS plan_safety_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL,
  sku_id INTEGER REFERENCES md_skus(id),
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  safety_stock_quantity REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'units',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_safety_sku ON plan_safety_stock(sku_id);
CREATE INDEX IF NOT EXISTS idx_plan_safety_raw ON plan_safety_stock(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_plan_safety_pkg ON plan_safety_stock(packaging_material_id);

CREATE TABLE IF NOT EXISTS plan_mrp_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_code TEXT NOT NULL UNIQUE,
  production_plan_id INTEGER REFERENCES plan_production_plans(id) ON DELETE SET NULL,
  run_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_mrp_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mrp_run_id INTEGER NOT NULL REFERENCES plan_mrp_runs(id) ON DELETE CASCADE,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  sku_id INTEGER REFERENCES md_skus(id),
  gross_requirement REAL NOT NULL DEFAULT 0,
  on_hand_quantity REAL NOT NULL DEFAULT 0,
  open_po_quantity REAL NOT NULL DEFAULT 0,
  safety_stock_quantity REAL NOT NULL DEFAULT 0,
  net_requirement REAL NOT NULL DEFAULT 0,
  shortage_quantity REAL NOT NULL DEFAULT 0,
  recommended_purchase_qty REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'each',
  recommendation_notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_plan_mrp_lines_run ON plan_mrp_lines(mrp_run_id);

CREATE TABLE IF NOT EXISTS plan_schedule_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_code TEXT NOT NULL UNIQUE,
  production_plan_line_id INTEGER REFERENCES plan_production_plan_lines(id) ON DELETE SET NULL,
  production_order_id INTEGER REFERENCES prod_orders(id) ON DELETE SET NULL,
  floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  sku_id INTEGER REFERENCES md_skus(id),
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_schedule_equipment ON plan_schedule_slots(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_plan_schedule_start ON plan_schedule_slots(scheduled_start);
`;

export const PLANNING_V1M_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_plan_demand_lines_forecast ON plan_demand_forecast_lines(forecast_id);
CREATE INDEX IF NOT EXISTS idx_plan_prod_lines_plan ON plan_production_plan_lines(production_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_mrp_lines_run ON plan_mrp_lines(mrp_run_id);
CREATE INDEX IF NOT EXISTS idx_plan_schedule_equipment ON plan_schedule_slots(floor_equipment_id);
`;

export const PLANNING_V1M_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
