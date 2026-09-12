/**
 * Phase 1N Sales, Depletions, Shipments & COGS Recognition — browser sql.js schema.
 * Operational sales/depletion documents; no AR. COGS snapshots are immutable at shipment post.
 */

export const SALES_DEPLETION_SCHEMA = `
CREATE TABLE IF NOT EXISTS sal_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  ship_to_address TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sal_customers_channel ON sal_customers(channel);
CREATE INDEX IF NOT EXISTS idx_sal_customers_active ON sal_customers(active);

CREATE TABLE IF NOT EXISTS sal_sales_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES sal_customers(id),
  channel TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'Sale',
  order_date TEXT NOT NULL,
  requested_ship_date TEXT,
  ship_from_location_id INTEGER REFERENCES md_storage_locations(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sal_orders_customer ON sal_sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sal_orders_status ON sal_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sal_orders_date ON sal_sales_orders(order_date);

CREATE TABLE IF NOT EXISTS sal_sales_order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_order_id INTEGER NOT NULL REFERENCES sal_sales_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  ordered_quantity REAL NOT NULL,
  shipped_quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'each',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sal_order_lines_order ON sal_sales_order_lines(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_order_lines_sku ON sal_sales_order_lines(sku_id);

CREATE TABLE IF NOT EXISTS sal_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_code TEXT NOT NULL UNIQUE,
  sales_order_id INTEGER NOT NULL REFERENCES sal_sales_orders(id),
  customer_id INTEGER NOT NULL REFERENCES sal_customers(id),
  channel TEXT NOT NULL,
  ship_from_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  ship_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  posted_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sal_shipments_order ON sal_shipments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_shipments_status ON sal_shipments(status);
CREATE INDEX IF NOT EXISTS idx_sal_shipments_date ON sal_shipments(ship_date);

CREATE TABLE IF NOT EXISTS sal_shipment_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES sal_shipments(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  sales_order_line_id INTEGER REFERENCES sal_sales_order_lines(id),
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  fg_lot_id INTEGER NOT NULL REFERENCES fg_lots(id),
  source_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  quantity REAL NOT NULL,
  allocation_method TEXT NOT NULL DEFAULT 'Manual',
  unit_cost_kyd_snapshot REAL,
  extended_cost_kyd REAL,
  fg_transaction_id INTEGER REFERENCES fg_transactions(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sal_ship_lines_shipment ON sal_shipment_lines(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sal_ship_lines_lot ON sal_shipment_lines(fg_lot_id);

CREATE TABLE IF NOT EXISTS sal_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_code TEXT NOT NULL UNIQUE,
  shipment_id INTEGER REFERENCES sal_shipments(id),
  sales_order_id INTEGER REFERENCES sal_sales_orders(id),
  customer_id INTEGER NOT NULL REFERENCES sal_customers(id),
  return_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  posted_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sal_returns_shipment ON sal_returns(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sal_returns_status ON sal_returns(status);

CREATE TABLE IF NOT EXISTS sal_return_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES sal_returns(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  shipment_line_id INTEGER REFERENCES sal_shipment_lines(id),
  fg_lot_id INTEGER NOT NULL REFERENCES fg_lots(id),
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  quantity REAL NOT NULL,
  disposition TEXT NOT NULL,
  destination_location_id INTEGER REFERENCES md_storage_locations(id),
  unit_cost_kyd_snapshot REAL,
  extended_cost_kyd REAL,
  fg_transaction_id INTEGER REFERENCES fg_transactions(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sal_return_lines_return ON sal_return_lines(return_id);

CREATE TABLE IF NOT EXISTS sal_cogs_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES sal_shipments(id),
  shipment_line_id INTEGER NOT NULL REFERENCES sal_shipment_lines(id),
  sales_order_id INTEGER NOT NULL REFERENCES sal_sales_orders(id),
  customer_id INTEGER NOT NULL REFERENCES sal_customers(id),
  channel TEXT NOT NULL,
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  product_id INTEGER REFERENCES md_products(id),
  fg_lot_id INTEGER NOT NULL REFERENCES fg_lots(id),
  source_location_id INTEGER NOT NULL REFERENCES md_storage_locations(id),
  quantity REAL NOT NULL,
  unit_cost_kyd_snapshot REAL NOT NULL,
  extended_cost_kyd REAL NOT NULL,
  recognition_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sal_cogs_shipment ON sal_cogs_records(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_sku ON sal_cogs_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_customer ON sal_cogs_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_channel ON sal_cogs_records(channel);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_location ON sal_cogs_records(source_location_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_date ON sal_cogs_records(recognition_date);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_product ON sal_cogs_records(product_id);
`;

export const SALES_DEPLETION_V1N_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_sal_orders_customer ON sal_sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_sku ON sal_cogs_records(sku_id);
`;

export const SALES_DEPLETION_V1N_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
