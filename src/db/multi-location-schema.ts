/**
 * Phase 1I multi-location inventory — transfer documents, cycle counts & barcodes.
 */

export const MULTI_LOCATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS inv_transfer_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Draft',
  origin_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  destination_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  ship_date TEXT,
  receive_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inv_transfer_status ON inv_transfer_documents(status);
CREATE INDEX IF NOT EXISTS idx_inv_transfer_origin ON inv_transfer_documents(origin_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfer_dest ON inv_transfer_documents(destination_location_id);

CREATE TABLE IF NOT EXISTS inv_transfer_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_document_id INTEGER NOT NULL REFERENCES inv_transfer_documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  inventory_type TEXT NOT NULL CHECK(inventory_type IN ('MATERIAL', 'FINISHED_GOODS')),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  fg_lot_id INTEGER REFERENCES fg_lots(id),
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  sku_id INTEGER REFERENCES md_skus(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  received_quantity REAL NOT NULL DEFAULT 0,
  transaction_group_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(transfer_document_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_transfer_lines_doc ON inv_transfer_lines(transfer_document_id);

CREATE TABLE IF NOT EXISTS inv_cycle_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_code TEXT NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  count_date TEXT NOT NULL,
  posted_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inv_cycle_counts_location ON inv_cycle_counts(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_cycle_counts_status ON inv_cycle_counts(status);

CREATE TABLE IF NOT EXISTS inv_cycle_count_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_count_id INTEGER NOT NULL REFERENCES inv_cycle_counts(id) ON DELETE CASCADE,
  inventory_type TEXT NOT NULL CHECK(inventory_type IN ('MATERIAL', 'FINISHED_GOODS')),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  fg_lot_id INTEGER REFERENCES fg_lots(id),
  sku_id INTEGER REFERENCES md_skus(id),
  system_quantity REAL NOT NULL DEFAULT 0,
  counted_quantity REAL,
  variance_quantity REAL,
  unit TEXT NOT NULL DEFAULT 'each',
  posted INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_inv_cycle_count_lines_count ON inv_cycle_count_lines(cycle_count_id);

CREATE TABLE IF NOT EXISTS inv_barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL UNIQUE COLLATE NOCASE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  label_text TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_barcodes_entity ON inv_barcodes(entity_type, entity_id);
`;

export const MULTI_LOCATION_V1I_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_inv_transfer_status ON inv_transfer_documents(status);
CREATE INDEX IF NOT EXISTS idx_inv_barcodes_entity ON inv_barcodes(entity_type, entity_id);
`;

export const MULTI_LOCATION_V1I_NEW_COLUMNS = [
  {
    table: 'md_storage_locations',
    column: 'hierarchy_level',
    ddl: `ALTER TABLE md_storage_locations ADD COLUMN hierarchy_level TEXT`,
  },
];
