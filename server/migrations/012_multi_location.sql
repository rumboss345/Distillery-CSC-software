-- Phase 1I multi-location inventory (PostgreSQL mirror)

ALTER TABLE md_storage_locations ADD COLUMN IF NOT EXISTS hierarchy_level TEXT;

CREATE TABLE IF NOT EXISTS inv_transfer_documents (
  id SERIAL PRIMARY KEY,
  transfer_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Draft',
  origin_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  destination_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  ship_date TIMESTAMPTZ,
  receive_date TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_transfer_lines (
  id SERIAL PRIMARY KEY,
  transfer_document_id INTEGER NOT NULL REFERENCES inv_transfer_documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  inventory_type TEXT NOT NULL CHECK(inventory_type IN ('MATERIAL', 'FINISHED_GOODS')),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  fg_lot_id INTEGER REFERENCES fg_lots(id),
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  sku_id INTEGER REFERENCES md_skus(id),
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  transaction_group_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(transfer_document_id, line_number)
);

CREATE TABLE IF NOT EXISTS inv_cycle_counts (
  id SERIAL PRIMARY KEY,
  count_code TEXT NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  count_date DATE NOT NULL,
  posted_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_cycle_count_lines (
  id SERIAL PRIMARY KEY,
  cycle_count_id INTEGER NOT NULL REFERENCES inv_cycle_counts(id) ON DELETE CASCADE,
  inventory_type TEXT NOT NULL CHECK(inventory_type IN ('MATERIAL', 'FINISHED_GOODS')),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  fg_lot_id INTEGER REFERENCES fg_lots(id),
  sku_id INTEGER REFERENCES md_skus(id),
  system_quantity NUMERIC NOT NULL DEFAULT 0,
  counted_quantity NUMERIC,
  variance_quantity NUMERIC,
  unit TEXT NOT NULL DEFAULT 'each',
  posted BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inv_barcodes (
  id SERIAL PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  label_text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_transfer_status ON inv_transfer_documents(status);
CREATE INDEX IF NOT EXISTS idx_inv_barcodes_entity ON inv_barcodes(entity_type, entity_id);
