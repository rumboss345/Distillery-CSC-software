/** Phase 1B master data tables — browser sql.js schema. */
export const MASTER_DATA_SCHEMA = `
CREATE TABLE IF NOT EXISTS md_code_sequences (
  entity_type TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS md_lookup_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lookup_type TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lookup_type, name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS md_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK(unit_type IN ('liquid', 'weight', 'count')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS md_unit_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_unit_code TEXT NOT NULL,
  to_unit_code TEXT NOT NULL,
  factor REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(from_unit_code, to_unit_code)
);

CREATE TABLE IF NOT EXISTS md_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_code TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  supplier_type TEXT NOT NULL DEFAULT 'Other',
  payment_terms TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS md_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_abv REAL,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS md_skus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_code TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES md_products(id),
  name TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'bottle',
  package_size REAL NOT NULL,
  package_size_unit TEXT NOT NULL DEFAULT 'mL',
  containers_per_case INTEGER NOT NULL DEFAULT 1,
  cases_per_pallet INTEGER,
  target_abv REAL,
  barcode_upc TEXT NOT NULL DEFAULT '',
  case_barcode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS md_raw_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  material_type TEXT NOT NULL,
  inventory_unit TEXT NOT NULL,
  purchase_unit TEXT NOT NULL,
  conversion_factor REAL NOT NULL DEFAULT 1,
  preferred_supplier_id INTEGER REFERENCES md_suppliers(id),
  reorder_level REAL,
  reorder_quantity REAL,
  standard_cost REAL,
  last_cost REAL,
  purchase_currency TEXT NOT NULL DEFAULT 'USD',
  active INTEGER NOT NULL DEFAULT 1,
  lot_tracked INTEGER NOT NULL DEFAULT 0,
  expiration_tracked INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS md_packaging_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  packaging_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  packaging_type TEXT NOT NULL,
  size_description TEXT NOT NULL DEFAULT '',
  inventory_unit TEXT NOT NULL DEFAULT 'each',
  purchase_unit TEXT NOT NULL DEFAULT 'case',
  units_per_purchase_unit REAL NOT NULL DEFAULT 1,
  preferred_supplier_id INTEGER REFERENCES md_suppliers(id),
  reorder_level REAL,
  reorder_quantity REAL,
  standard_cost REAL,
  last_cost REAL,
  purchase_currency TEXT NOT NULL DEFAULT 'USD',
  active INTEGER NOT NULL DEFAULT 1,
  lot_tracked INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS md_bulk_spirits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spirit_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  spirit_type TEXT NOT NULL,
  origin_country TEXT NOT NULL DEFAULT '',
  producer_supplier_id INTEGER REFERENCES md_suppliers(id),
  nominal_abv REAL NOT NULL,
  inventory_unit TEXT NOT NULL DEFAULT 'L',
  purchase_unit TEXT NOT NULL DEFAULT 'L',
  litres_per_purchase_unit REAL NOT NULL DEFAULT 1,
  standard_cost REAL,
  last_cost REAL,
  purchase_currency TEXT NOT NULL DEFAULT 'USD',
  lot_tracked INTEGER NOT NULL DEFAULT 1,
  excise_category TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS md_storage_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  parent_location_id INTEGER REFERENCES md_storage_locations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_md_skus_product ON md_skus(product_id);
CREATE INDEX IF NOT EXISTS idx_md_lookup_type ON md_lookup_values(lookup_type);
CREATE INDEX IF NOT EXISTS idx_md_locations_parent ON md_storage_locations(parent_location_id);
`;
