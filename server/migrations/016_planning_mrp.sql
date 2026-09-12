-- Phase 1M Production Planning, Demand Forecasting & MRP.

CREATE TABLE IF NOT EXISTS plan_demand_forecasts (
  id BIGSERIAL PRIMARY KEY,
  forecast_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'weekly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_demand_forecast_lines (
  id BIGSERIAL PRIMARY KEY,
  forecast_id BIGINT NOT NULL REFERENCES plan_demand_forecasts(id) ON DELETE CASCADE,
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  demand_quantity NUMERIC NOT NULL,
  quantity_unit TEXT NOT NULL DEFAULT 'units',
  period_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_plan_demand_lines_forecast ON plan_demand_forecast_lines(forecast_id);
CREATE INDEX IF NOT EXISTS idx_plan_demand_lines_sku ON plan_demand_forecast_lines(sku_id);

CREATE TABLE IF NOT EXISTS plan_production_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan_start DATE NOT NULL,
  plan_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  linked_forecast_id BIGINT REFERENCES plan_demand_forecasts(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_production_plan_lines (
  id BIGSERIAL PRIMARY KEY,
  production_plan_id BIGINT NOT NULL REFERENCES plan_production_plans(id) ON DELETE CASCADE,
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  recipe_id BIGINT REFERENCES rc_recipes(id),
  recipe_version_id BIGINT REFERENCES rc_recipe_versions(id),
  planned_quantity NUMERIC NOT NULL,
  quantity_unit TEXT NOT NULL DEFAULT 'units',
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  floor_equipment_id BIGINT REFERENCES floor_equipment(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_plan_prod_lines_plan ON plan_production_plan_lines(production_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_prod_lines_sku ON plan_production_plan_lines(sku_id);

CREATE TABLE IF NOT EXISTS plan_safety_stock (
  id BIGSERIAL PRIMARY KEY,
  item_type TEXT NOT NULL,
  sku_id BIGINT REFERENCES md_skus(id),
  raw_material_id BIGINT REFERENCES md_raw_materials(id),
  packaging_material_id BIGINT REFERENCES md_packaging_materials(id),
  safety_stock_quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'units',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_safety_sku ON plan_safety_stock(sku_id);
CREATE INDEX IF NOT EXISTS idx_plan_safety_raw ON plan_safety_stock(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_plan_safety_pkg ON plan_safety_stock(packaging_material_id);

CREATE TABLE IF NOT EXISTS plan_mrp_runs (
  id BIGSERIAL PRIMARY KEY,
  run_code TEXT NOT NULL UNIQUE,
  production_plan_id BIGINT REFERENCES plan_production_plans(id) ON DELETE SET NULL,
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_mrp_lines (
  id BIGSERIAL PRIMARY KEY,
  mrp_run_id BIGINT NOT NULL REFERENCES plan_mrp_runs(id) ON DELETE CASCADE,
  material_type TEXT NOT NULL,
  raw_material_id BIGINT REFERENCES md_raw_materials(id),
  packaging_material_id BIGINT REFERENCES md_packaging_materials(id),
  sku_id BIGINT REFERENCES md_skus(id),
  gross_requirement NUMERIC NOT NULL DEFAULT 0,
  on_hand_quantity NUMERIC NOT NULL DEFAULT 0,
  open_po_quantity NUMERIC NOT NULL DEFAULT 0,
  safety_stock_quantity NUMERIC NOT NULL DEFAULT 0,
  net_requirement NUMERIC NOT NULL DEFAULT 0,
  shortage_quantity NUMERIC NOT NULL DEFAULT 0,
  recommended_purchase_qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'each',
  recommendation_notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_plan_mrp_lines_run ON plan_mrp_lines(mrp_run_id);

CREATE TABLE IF NOT EXISTS plan_schedule_slots (
  id BIGSERIAL PRIMARY KEY,
  schedule_code TEXT NOT NULL UNIQUE,
  production_plan_line_id BIGINT REFERENCES plan_production_plan_lines(id) ON DELETE SET NULL,
  production_order_id BIGINT REFERENCES prod_orders(id) ON DELETE SET NULL,
  floor_equipment_id BIGINT NOT NULL REFERENCES floor_equipment(id),
  sku_id BIGINT REFERENCES md_skus(id),
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'Planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_schedule_equipment ON plan_schedule_slots(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_plan_schedule_start ON plan_schedule_slots(scheduled_start);
