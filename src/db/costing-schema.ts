/**
 * Phase 1G costing, landed cost allocation & COGS foundation — browser sql.js schema.
 */

export const COSTING_SCHEMA = `
CREATE TABLE IF NOT EXISTS cost_landed_cost_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landed_cost_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Draft',
  supplier_id INTEGER REFERENCES md_suppliers(id),
  purchase_order_id INTEGER REFERENCES pur_purchase_orders(id),
  receipt_id INTEGER REFERENCES pur_receipts(id),
  shipment_reference TEXT,
  container_number TEXT,
  bill_of_lading TEXT,
  currency TEXT NOT NULL DEFAULT 'KYD',
  exchange_rate_to_kyd REAL NOT NULL DEFAULT 1,
  effective_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  reversed_at TEXT
);

CREATE TABLE IF NOT EXISTS cost_landed_cost_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landed_cost_document_id INTEGER NOT NULL REFERENCES cost_landed_cost_documents(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  original_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KYD',
  exchange_rate_to_kyd REAL NOT NULL DEFAULT 1,
  kyd_amount REAL NOT NULL DEFAULT 0,
  allocation_method TEXT NOT NULL DEFAULT 'BY_PURCHASE_VALUE',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cost_landed_cost_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landed_cost_document_id INTEGER NOT NULL REFERENCES cost_landed_cost_documents(id),
  component_id INTEGER NOT NULL REFERENCES cost_landed_cost_components(id),
  receipt_id INTEGER REFERENCES pur_receipts(id),
  receipt_line_id INTEGER REFERENCES pur_receipt_lines(id),
  material_lot_id INTEGER REFERENCES mat_lots(id),
  allocation_basis TEXT NOT NULL,
  basis_value REAL,
  allocation_percent REAL,
  allocated_original_amount REAL,
  allocated_kyd_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_material_lot_layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_lot_id INTEGER NOT NULL REFERENCES mat_lots(id),
  source_type TEXT NOT NULL,
  source_id INTEGER,
  effective_date TEXT NOT NULL,
  quantity_basis REAL NOT NULL DEFAULT 0,
  purchase_cost_kyd REAL NOT NULL DEFAULT 0,
  landed_cost_kyd REAL NOT NULL DEFAULT 0,
  total_cost_kyd REAL NOT NULL DEFAULT 0,
  unit_cost_kyd REAL,
  currency_snapshot TEXT,
  exchange_rate_snapshot REAL,
  cost_status TEXT NOT NULL DEFAULT 'VALUED',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_material_consumptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_transaction_id INTEGER NOT NULL REFERENCES mat_transactions(id),
  production_order_id INTEGER REFERENCES prod_orders(id),
  production_batch_id INTEGER REFERENCES prod_batches(id),
  material_lot_id INTEGER NOT NULL REFERENCES mat_lots(id),
  base_quantity_consumed REAL NOT NULL,
  unit_cost_kyd_snapshot REAL,
  extended_cost_kyd REAL,
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  source_cost_layer_id INTEGER REFERENCES cost_material_lot_layers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_liquid_lot_layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liquid_lot_id INTEGER NOT NULL REFERENCES liq_lots(id),
  source_type TEXT NOT NULL,
  source_id INTEGER,
  production_batch_id INTEGER REFERENCES prod_batches(id),
  effective_date TEXT NOT NULL,
  volume_litres REAL NOT NULL DEFAULT 0,
  lpa REAL NOT NULL DEFAULT 0,
  input_cost_kyd REAL NOT NULL DEFAULT 0,
  conversion_cost_kyd REAL NOT NULL DEFAULT 0,
  total_cost_kyd REAL NOT NULL DEFAULT 0,
  cost_per_litre_kyd REAL,
  cost_per_lpa_kyd REAL,
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_batch_conversion_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_batch_id INTEGER NOT NULL REFERENCES prod_batches(id),
  cost_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity REAL,
  rate REAL,
  original_currency TEXT NOT NULL DEFAULT 'KYD',
  original_amount REAL NOT NULL DEFAULT 0,
  exchange_rate_to_kyd REAL NOT NULL DEFAULT 1,
  amount_kyd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS cost_batch_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_batch_id INTEGER NOT NULL REFERENCES prod_batches(id),
  snapshot_type TEXT NOT NULL DEFAULT 'Preliminary',
  status TEXT NOT NULL DEFAULT 'Draft',
  material_cost_kyd REAL,
  liquid_cost_kyd REAL,
  conversion_cost_kyd REAL NOT NULL DEFAULT 0,
  total_cost_kyd REAL,
  output_volume_litres REAL,
  output_lpa REAL,
  cost_per_litre_kyd REAL,
  cost_per_lpa_kyd REAL,
  planned_cost_kyd REAL,
  variance_kyd REAL,
  variance_percent REAL,
  unvalued_input_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cost_production_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_batch_id INTEGER NOT NULL REFERENCES prod_batches(id),
  output_type TEXT NOT NULL DEFAULT 'Liquid Lot',
  liquid_lot_id INTEGER REFERENCES liq_lots(id),
  sku_id INTEGER REFERENCES md_skus(id),
  finished_goods_lot_id INTEGER,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'L',
  base_quantity REAL NOT NULL DEFAULT 0,
  base_unit TEXT NOT NULL DEFAULT 'L',
  allocated_batch_cost_kyd REAL,
  unit_cost_kyd REAL,
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_code TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  amount_kyd REAL NOT NULL DEFAULT 0,
  effective_date TEXT NOT NULL,
  source_document_type TEXT,
  source_document_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reversal_of_adjustment_id INTEGER REFERENCES cost_adjustments(id)
);

CREATE TABLE IF NOT EXISTS cost_post_consumption_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_lot_id INTEGER REFERENCES mat_lots(id),
  production_batch_id INTEGER REFERENCES prod_batches(id),
  landed_cost_document_id INTEGER REFERENCES cost_landed_cost_documents(id),
  adjustment_amount_kyd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending Review',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_liquid_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liquid_transaction_id INTEGER REFERENCES liq_transactions(id),
  transaction_group_id TEXT,
  liquid_lot_id INTEGER NOT NULL REFERENCES liq_lots(id),
  source_tank_id INTEGER REFERENCES liq_tanks(id),
  destination_tank_id INTEGER REFERENCES liq_tanks(id),
  volume_litres REAL NOT NULL DEFAULT 0,
  lpa REAL,
  transferred_cost_kyd REAL NOT NULL DEFAULT 0,
  cost_per_litre_snapshot REAL,
  cost_per_lpa_snapshot REAL,
  movement_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  reversal_of_id INTEGER REFERENCES cost_liquid_movements(id),
  costing_status TEXT NOT NULL DEFAULT 'Recorded',
  source_cost_layer_id INTEGER REFERENCES cost_liquid_lot_layers(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cost_lcd_receipt ON cost_landed_cost_documents(receipt_id);
CREATE INDEX IF NOT EXISTS idx_cost_lcd_status ON cost_landed_cost_documents(status);
CREATE INDEX IF NOT EXISTS idx_cost_lcc_document ON cost_landed_cost_components(landed_cost_document_id);
CREATE INDEX IF NOT EXISTS idx_cost_lca_document ON cost_landed_cost_allocations(landed_cost_document_id);
CREATE INDEX IF NOT EXISTS idx_cost_lca_lot ON cost_landed_cost_allocations(material_lot_id);
CREATE INDEX IF NOT EXISTS idx_cost_mll_lot ON cost_material_lot_layers(material_lot_id);
CREATE INDEX IF NOT EXISTS idx_cost_mc_batch ON cost_material_consumptions(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_cost_mc_lot ON cost_material_consumptions(material_lot_id);
CREATE INDEX IF NOT EXISTS idx_cost_lll_lot ON cost_liquid_lot_layers(liquid_lot_id);
CREATE INDEX IF NOT EXISTS idx_cost_bcc_batch ON cost_batch_conversion_costs(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_cost_bs_batch ON cost_batch_snapshots(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_cost_po_batch ON cost_production_outputs(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_cost_adj_target ON cost_adjustments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_cost_pcf_batch ON cost_post_consumption_flags(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_clm_lot ON cost_liquid_movements(liquid_lot_id);
CREATE INDEX IF NOT EXISTS idx_clm_group ON cost_liquid_movements(transaction_group_id);
CREATE INDEX IF NOT EXISTS idx_clm_tx ON cost_liquid_movements(liquid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_clm_reversal ON cost_liquid_movements(reversal_of_id);
`;

export const COSTING_V1G_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_cost_lcd_receipt ON cost_landed_cost_documents(receipt_id);
CREATE INDEX IF NOT EXISTS idx_cost_mll_lot ON cost_material_lot_layers(material_lot_id);
`;

/** Phase 1G liquid transfer cost persistence — additive for existing browser DBs. */
export const COSTING_V1G_TRANSFER_MIGRATION = `
CREATE TABLE IF NOT EXISTS cost_liquid_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liquid_transaction_id INTEGER REFERENCES liq_transactions(id),
  transaction_group_id TEXT,
  liquid_lot_id INTEGER NOT NULL REFERENCES liq_lots(id),
  source_tank_id INTEGER REFERENCES liq_tanks(id),
  destination_tank_id INTEGER REFERENCES liq_tanks(id),
  volume_litres REAL NOT NULL DEFAULT 0,
  lpa REAL,
  transferred_cost_kyd REAL NOT NULL DEFAULT 0,
  cost_per_litre_snapshot REAL,
  cost_per_lpa_snapshot REAL,
  movement_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  reversal_of_id INTEGER REFERENCES cost_liquid_movements(id),
  costing_status TEXT NOT NULL DEFAULT 'Recorded',
  source_cost_layer_id INTEGER REFERENCES cost_liquid_lot_layers(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clm_lot ON cost_liquid_movements(liquid_lot_id);
CREATE INDEX IF NOT EXISTS idx_clm_group ON cost_liquid_movements(transaction_group_id);
CREATE INDEX IF NOT EXISTS idx_clm_tx ON cost_liquid_movements(liquid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_clm_reversal ON cost_liquid_movements(reversal_of_id);
`;

export const COSTING_V1G_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
