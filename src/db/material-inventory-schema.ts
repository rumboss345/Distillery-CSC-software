/**
 * Phase 1F material inventory ledger + purchasing — browser sql.js schema.
 * Balances are transaction-derived; never authoritative quantity_on_hand columns.
 */

export const MATERIAL_INVENTORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS mat_storage_bins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bin_code TEXT NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mat_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_code TEXT NOT NULL UNIQUE,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  supplier_id INTEGER REFERENCES md_suppliers(id),
  supplier_lot_number TEXT,
  manufacturer_lot_number TEXT,
  received_date TEXT,
  manufacture_date TEXT,
  expiration_date TEXT,
  best_before_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mat_item_uom_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  conversion_factor REAL NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mat_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_code TEXT NOT NULL UNIQUE,
  transaction_group_id TEXT,
  transaction_type TEXT NOT NULL,
  transaction_timestamp TEXT NOT NULL,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  source_location_id INTEGER REFERENCES md_storage_locations(id),
  source_bin_id INTEGER REFERENCES mat_storage_bins(id),
  destination_location_id INTEGER REFERENCES md_storage_locations(id),
  destination_bin_id INTEGER REFERENCES mat_storage_bins(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  base_quantity REAL NOT NULL,
  base_unit TEXT NOT NULL,
  reason_code TEXT,
  source_document_type TEXT,
  source_document_id INTEGER,
  purchase_order_id INTEGER,
  receipt_id INTEGER,
  production_order_id INTEGER,
  production_batch_id INTEGER,
  unit_cost REAL,
  cost_unit TEXT,
  currency TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reversal_of_transaction_id INTEGER REFERENCES mat_transactions(id)
);

CREATE TABLE IF NOT EXISTS mat_reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  system_quantity REAL NOT NULL,
  physical_quantity REAL NOT NULL,
  variance_quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  reason TEXT NOT NULL DEFAULT '',
  transaction_id INTEGER REFERENCES mat_transactions(id),
  counted_by TEXT,
  counted_at TEXT,
  posted_at TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pur_purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_code TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES md_suppliers(id),
  order_date TEXT NOT NULL,
  expected_date TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  currency TEXT NOT NULL DEFAULT 'USD',
  supplier_reference TEXT,
  ship_to_location_id INTEGER REFERENCES md_storage_locations(id),
  payment_terms TEXT,
  shipping_terms TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  closed_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS pur_purchase_order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL REFERENCES pur_purchase_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  description TEXT NOT NULL DEFAULT '',
  ordered_quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  normalized_quantity REAL,
  normalized_unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  expected_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(purchase_order_id, line_number)
);

CREATE TABLE IF NOT EXISTS pur_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_code TEXT NOT NULL UNIQUE,
  purchase_order_id INTEGER REFERENCES pur_purchase_orders(id),
  supplier_id INTEGER NOT NULL REFERENCES md_suppliers(id),
  received_date TEXT NOT NULL,
  receiving_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  packing_slip_number TEXT,
  supplier_invoice_number TEXT,
  container_number TEXT,
  bill_of_lading TEXT,
  customs_reference TEXT,
  import_type TEXT,
  origin_country TEXT,
  freight_amount REAL,
  duty_amount REAL,
  brokerage_amount REAL,
  insurance_amount REAL,
  local_delivery_amount REAL,
  other_charges REAL,
  exchange_rate REAL,
  status TEXT NOT NULL DEFAULT 'Draft',
  transaction_group_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  received_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  reversed_at TEXT
);

CREATE TABLE IF NOT EXISTS pur_receipt_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES pur_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id INTEGER REFERENCES pur_purchase_order_lines(id),
  material_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  received_quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  accepted_quantity REAL NOT NULL DEFAULT 0,
  rejected_quantity REAL NOT NULL DEFAULT 0,
  base_quantity REAL NOT NULL DEFAULT 0,
  base_unit TEXT NOT NULL,
  material_lot_id INTEGER REFERENCES mat_lots(id),
  unit_cost REAL,
  currency TEXT,
  notes TEXT NOT NULL DEFAULT '',
  supplier_lot_number TEXT,
  expiration_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_mat_lots_material ON mat_lots(material_type, raw_material_id, packaging_material_id);
CREATE INDEX IF NOT EXISTS idx_mat_lots_status ON mat_lots(status);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_material ON mat_transactions(material_type, raw_material_id, packaging_material_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_lot ON mat_transactions(material_lot_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_location_src ON mat_transactions(source_location_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_location_dest ON mat_transactions(destination_location_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_group ON mat_transactions(transaction_group_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_reversal ON mat_transactions(reversal_of_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pur_po_supplier ON pur_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pur_po_status ON pur_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_pur_po_lines_po ON pur_purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_pur_receipts_po ON pur_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_pur_receipt_lines_receipt ON pur_receipt_lines(receipt_id);
`;

export const MATERIAL_INVENTORY_V1F_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_mat_lots_material ON mat_lots(material_type, raw_material_id, packaging_material_id);
CREATE INDEX IF NOT EXISTS idx_mat_transactions_material ON mat_transactions(material_type, raw_material_id, packaging_material_id);
`;

export const MATERIAL_INVENTORY_V1F_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: 'md_raw_materials',
    column: 'inventory_tracking_mode',
    ddl: "ALTER TABLE md_raw_materials ADD COLUMN inventory_tracking_mode TEXT NOT NULL DEFAULT 'LEGACY'",
  },
  {
    table: 'md_packaging_materials',
    column: 'inventory_tracking_mode',
    ddl: "ALTER TABLE md_packaging_materials ADD COLUMN inventory_tracking_mode TEXT NOT NULL DEFAULT 'LEGACY'",
  },
  {
    table: 'prod_batch_inputs',
    column: 'material_lot_id',
    ddl: 'ALTER TABLE prod_batch_inputs ADD COLUMN material_lot_id INTEGER REFERENCES mat_lots(id)',
  },
  {
    table: 'prod_batch_inputs',
    column: 'source_location_id',
    ddl: 'ALTER TABLE prod_batch_inputs ADD COLUMN source_location_id INTEGER REFERENCES md_storage_locations(id)',
  },
  {
    table: 'prod_batch_inputs',
    column: 'material_transaction_id',
    ddl: 'ALTER TABLE prod_batch_inputs ADD COLUMN material_transaction_id INTEGER REFERENCES mat_transactions(id)',
  },
  {
    table: 'prod_batch_inputs',
    column: 'base_quantity',
    ddl: 'ALTER TABLE prod_batch_inputs ADD COLUMN base_quantity REAL',
  },
  {
    table: 'prod_batch_inputs',
    column: 'base_unit',
    ddl: 'ALTER TABLE prod_batch_inputs ADD COLUMN base_unit TEXT',
  },
  {
    table: 'md_raw_materials',
    column: 'ledger_activated_at',
    ddl: 'ALTER TABLE md_raw_materials ADD COLUMN ledger_activated_at TEXT',
  },
  {
    table: 'md_raw_materials',
    column: 'ledger_activation_reference',
    ddl: 'ALTER TABLE md_raw_materials ADD COLUMN ledger_activation_reference TEXT',
  },
  {
    table: 'md_packaging_materials',
    column: 'ledger_activated_at',
    ddl: 'ALTER TABLE md_packaging_materials ADD COLUMN ledger_activated_at TEXT',
  },
  {
    table: 'md_packaging_materials',
    column: 'ledger_activation_reference',
    ddl: 'ALTER TABLE md_packaging_materials ADD COLUMN ledger_activation_reference TEXT',
  },
  {
    table: 'mat_transactions',
    column: 'cost_unit',
    ddl: 'ALTER TABLE mat_transactions ADD COLUMN cost_unit TEXT',
  },
];
