-- Phase 1B master data schema (PostgreSQL mirror for future cutover; not required during browser-local testing)

CREATE TABLE IF NOT EXISTS md_code_sequences (
  entity_type TEXT PRIMARY KEY,
  last_number BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS md_lookup_values (
  id SERIAL PRIMARY KEY,
  lookup_type TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lookup_type, name)
);

CREATE TABLE IF NOT EXISTS md_suppliers (
  id SERIAL PRIMARY KEY,
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
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS md_products (
  id SERIAL PRIMARY KEY,
  product_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_abv NUMERIC(6, 3),
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS md_skus (
  id SERIAL PRIMARY KEY,
  sku_code TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES md_products(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'bottle',
  package_size NUMERIC(14, 4) NOT NULL,
  package_size_unit TEXT NOT NULL DEFAULT 'mL',
  containers_per_case INTEGER NOT NULL DEFAULT 1,
  cases_per_pallet INTEGER,
  target_abv NUMERIC(6, 3),
  barcode_upc TEXT NOT NULL DEFAULT '',
  case_barcode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS md_raw_materials (
  id SERIAL PRIMARY KEY,
  material_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  material_type TEXT NOT NULL,
  inventory_unit TEXT NOT NULL,
  purchase_unit TEXT NOT NULL,
  conversion_factor NUMERIC(18, 8) NOT NULL DEFAULT 1,
  preferred_supplier_id INTEGER REFERENCES md_suppliers(id) ON DELETE SET NULL,
  reorder_level NUMERIC(14, 4),
  reorder_quantity NUMERIC(14, 4),
  standard_cost NUMERIC(18, 6),
  last_cost NUMERIC(18, 6),
  purchase_currency TEXT NOT NULL DEFAULT 'USD',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  lot_tracked BOOLEAN NOT NULL DEFAULT FALSE,
  expiration_tracked BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS md_packaging_materials (
  id SERIAL PRIMARY KEY,
  packaging_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  packaging_type TEXT NOT NULL,
  size_description TEXT NOT NULL DEFAULT '',
  inventory_unit TEXT NOT NULL DEFAULT 'each',
  purchase_unit TEXT NOT NULL DEFAULT 'case',
  units_per_purchase_unit NUMERIC(18, 8) NOT NULL DEFAULT 1,
  preferred_supplier_id INTEGER REFERENCES md_suppliers(id) ON DELETE SET NULL,
  reorder_level NUMERIC(14, 4),
  reorder_quantity NUMERIC(14, 4),
  standard_cost NUMERIC(18, 6),
  last_cost NUMERIC(18, 6),
  purchase_currency TEXT NOT NULL DEFAULT 'USD',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  lot_tracked BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS md_bulk_spirits (
  id SERIAL PRIMARY KEY,
  spirit_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  spirit_type TEXT NOT NULL,
  origin_country TEXT NOT NULL DEFAULT '',
  producer_supplier_id INTEGER REFERENCES md_suppliers(id) ON DELETE SET NULL,
  nominal_abv NUMERIC(6, 3) NOT NULL,
  inventory_unit TEXT NOT NULL DEFAULT 'L',
  purchase_unit TEXT NOT NULL DEFAULT 'L',
  litres_per_purchase_unit NUMERIC(14, 4) NOT NULL DEFAULT 1,
  standard_cost NUMERIC(18, 6),
  last_cost NUMERIC(18, 6),
  purchase_currency TEXT NOT NULL DEFAULT 'USD',
  lot_tracked BOOLEAN NOT NULL DEFAULT TRUE,
  excise_category TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS md_storage_locations (
  id SERIAL PRIMARY KEY,
  location_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  parent_location_id INTEGER REFERENCES md_storage_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_md_skus_product ON md_skus(product_id);
CREATE INDEX IF NOT EXISTS idx_md_lookup_type ON md_lookup_values(lookup_type);
