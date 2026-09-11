-- Phase 1F material inventory + purchasing mirror (PostgreSQL inactive until Step 1A cutover).

CREATE TABLE IF NOT EXISTS mat_storage_bins (
  id SERIAL PRIMARY KEY,
  bin_code TEXT NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mat_lots (
  id SERIAL PRIMARY KEY,
  lot_code TEXT NOT NULL UNIQUE,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  supplier_id INTEGER REFERENCES md_suppliers(id),
  supplier_lot_number TEXT,
  manufacturer_lot_number TEXT,
  received_date TIMESTAMPTZ,
  manufacture_date TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  best_before_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mat_item_uom_conversions (
  id SERIAL PRIMARY KEY,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  conversion_factor DOUBLE PRECISION NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mat_transactions (
  id SERIAL PRIMARY KEY,
  transaction_code TEXT NOT NULL UNIQUE,
  transaction_group_id TEXT,
  transaction_type TEXT NOT NULL,
  transaction_timestamp TIMESTAMPTZ NOT NULL,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  source_location_id INTEGER REFERENCES md_storage_locations(id),
  source_bin_id INTEGER REFERENCES mat_storage_bins(id),
  destination_location_id INTEGER REFERENCES md_storage_locations(id),
  destination_bin_id INTEGER REFERENCES mat_storage_bins(id),
  quantity DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  base_quantity DOUBLE PRECISION NOT NULL,
  base_unit TEXT NOT NULL,
  reason_code TEXT,
  source_document_type TEXT,
  source_document_id INTEGER,
  purchase_order_id INTEGER,
  receipt_id INTEGER,
  production_order_id INTEGER,
  production_batch_id INTEGER,
  unit_cost DOUBLE PRECISION,
  currency TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversal_of_transaction_id INTEGER REFERENCES mat_transactions(id)
);

CREATE TABLE IF NOT EXISTS mat_reconciliations (
  id SERIAL PRIMARY KEY,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  system_quantity DOUBLE PRECISION NOT NULL,
  physical_quantity DOUBLE PRECISION NOT NULL,
  variance_quantity DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  reason TEXT NOT NULL DEFAULT '',
  transaction_id INTEGER REFERENCES mat_transactions(id),
  counted_by TEXT,
  counted_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pur_purchase_orders (
  id SERIAL PRIMARY KEY,
  po_code TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES md_suppliers(id),
  order_date TIMESTAMPTZ NOT NULL,
  expected_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Draft',
  currency TEXT NOT NULL DEFAULT 'USD',
  supplier_reference TEXT,
  ship_to_location_id INTEGER REFERENCES md_storage_locations(id),
  payment_terms TEXT,
  shipping_terms TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pur_purchase_order_lines (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES pur_purchase_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  description TEXT NOT NULL DEFAULT '',
  ordered_quantity DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  normalized_quantity DOUBLE PRECISION,
  normalized_unit TEXT,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  expected_date TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(purchase_order_id, line_number)
);

CREATE TABLE IF NOT EXISTS pur_receipts (
  id SERIAL PRIMARY KEY,
  receipt_code TEXT NOT NULL UNIQUE,
  purchase_order_id INTEGER REFERENCES pur_purchase_orders(id),
  supplier_id INTEGER NOT NULL REFERENCES md_suppliers(id),
  received_date TIMESTAMPTZ NOT NULL,
  receiving_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  packing_slip_number TEXT,
  supplier_invoice_number TEXT,
  container_number TEXT,
  bill_of_lading TEXT,
  customs_reference TEXT,
  import_type TEXT,
  origin_country TEXT,
  freight_amount DOUBLE PRECISION,
  duty_amount DOUBLE PRECISION,
  brokerage_amount DOUBLE PRECISION,
  insurance_amount DOUBLE PRECISION,
  local_delivery_amount DOUBLE PRECISION,
  other_charges DOUBLE PRECISION,
  exchange_rate DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'Draft',
  transaction_group_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  received_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pur_receipt_lines (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES pur_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id INTEGER REFERENCES pur_purchase_order_lines(id),
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  received_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  accepted_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  rejected_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_unit TEXT NOT NULL,
  material_lot_id INTEGER REFERENCES mat_lots(id),
  unit_cost DOUBLE PRECISION,
  currency TEXT,
  notes TEXT NOT NULL DEFAULT '',
  supplier_lot_number TEXT,
  expiration_date TIMESTAMPTZ
);

ALTER TABLE md_raw_materials ADD COLUMN IF NOT EXISTS inventory_tracking_mode TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE md_packaging_materials ADD COLUMN IF NOT EXISTS inventory_tracking_mode TEXT NOT NULL DEFAULT 'LEGACY';

ALTER TABLE prod_batch_inputs ADD COLUMN IF NOT EXISTS material_lot_id INTEGER REFERENCES mat_lots(id);
ALTER TABLE prod_batch_inputs ADD COLUMN IF NOT EXISTS source_location_id INTEGER REFERENCES md_storage_locations(id);
ALTER TABLE prod_batch_inputs ADD COLUMN IF NOT EXISTS material_transaction_id INTEGER REFERENCES mat_transactions(id);
ALTER TABLE prod_batch_inputs ADD COLUMN IF NOT EXISTS base_quantity DOUBLE PRECISION;
ALTER TABLE prod_batch_inputs ADD COLUMN IF NOT EXISTS base_unit TEXT;

CREATE INDEX IF NOT EXISTS idx_mat_lots_material ON mat_lots(material_type, raw_material_id, packaging_material_id);
CREATE INDEX IF NOT EXISTS idx_mat_lots_status ON mat_lots(status);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_material ON mat_transactions(material_type, raw_material_id, packaging_material_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_lot ON mat_transactions(material_lot_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_group ON mat_transactions(transaction_group_id);
CREATE INDEX IF NOT EXISTS idx_pur_po_supplier ON pur_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pur_po_status ON pur_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_pur_receipts_po ON pur_receipts(purchase_order_id);
