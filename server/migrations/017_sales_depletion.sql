-- Phase 1N Sales, Depletions, Shipments & COGS Recognition (PostgreSQL inactive until Step 1A).

CREATE TABLE IF NOT EXISTS sal_customers (
  id BIGSERIAL PRIMARY KEY,
  customer_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  ship_to_address TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_customers_channel ON sal_customers(channel);
CREATE INDEX IF NOT EXISTS idx_sal_customers_active ON sal_customers(active);

CREATE TABLE IF NOT EXISTS sal_sales_orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES sal_customers(id),
  channel TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'Sale',
  order_date DATE NOT NULL,
  requested_ship_date DATE,
  ship_from_location_id BIGINT REFERENCES md_storage_locations(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_orders_customer ON sal_sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sal_orders_status ON sal_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sal_orders_date ON sal_sales_orders(order_date);

CREATE TABLE IF NOT EXISTS sal_sales_order_lines (
  id BIGSERIAL PRIMARY KEY,
  sales_order_id BIGINT NOT NULL REFERENCES sal_sales_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  ordered_quantity NUMERIC(18,6) NOT NULL,
  shipped_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'each',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sal_order_lines_order ON sal_sales_order_lines(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_order_lines_sku ON sal_sales_order_lines(sku_id);

CREATE TABLE IF NOT EXISTS sal_shipments (
  id BIGSERIAL PRIMARY KEY,
  shipment_code TEXT NOT NULL UNIQUE,
  sales_order_id BIGINT NOT NULL REFERENCES sal_sales_orders(id),
  customer_id BIGINT NOT NULL REFERENCES sal_customers(id),
  channel TEXT NOT NULL,
  ship_from_location_id BIGINT NOT NULL REFERENCES md_storage_locations(id),
  ship_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  posted_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_shipments_order ON sal_shipments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sal_shipments_status ON sal_shipments(status);
CREATE INDEX IF NOT EXISTS idx_sal_shipments_date ON sal_shipments(ship_date);

CREATE TABLE IF NOT EXISTS sal_shipment_lines (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES sal_shipments(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  sales_order_line_id BIGINT REFERENCES sal_sales_order_lines(id),
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  fg_lot_id BIGINT NOT NULL REFERENCES fg_lots(id),
  source_location_id BIGINT NOT NULL REFERENCES md_storage_locations(id),
  quantity NUMERIC(18,6) NOT NULL,
  allocation_method TEXT NOT NULL DEFAULT 'Manual',
  unit_cost_kyd_snapshot NUMERIC(18,6),
  extended_cost_kyd NUMERIC(18,6),
  fg_transaction_id BIGINT REFERENCES fg_transactions(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sal_ship_lines_shipment ON sal_shipment_lines(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sal_ship_lines_lot ON sal_shipment_lines(fg_lot_id);

CREATE TABLE IF NOT EXISTS sal_returns (
  id BIGSERIAL PRIMARY KEY,
  return_code TEXT NOT NULL UNIQUE,
  shipment_id BIGINT REFERENCES sal_shipments(id),
  sales_order_id BIGINT REFERENCES sal_sales_orders(id),
  customer_id BIGINT NOT NULL REFERENCES sal_customers(id),
  return_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  posted_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_returns_shipment ON sal_returns(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sal_returns_status ON sal_returns(status);

CREATE TABLE IF NOT EXISTS sal_return_lines (
  id BIGSERIAL PRIMARY KEY,
  return_id BIGINT NOT NULL REFERENCES sal_returns(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  shipment_line_id BIGINT REFERENCES sal_shipment_lines(id),
  fg_lot_id BIGINT NOT NULL REFERENCES fg_lots(id),
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  quantity NUMERIC(18,6) NOT NULL,
  disposition TEXT NOT NULL,
  destination_location_id BIGINT REFERENCES md_storage_locations(id),
  unit_cost_kyd_snapshot NUMERIC(18,6),
  extended_cost_kyd NUMERIC(18,6),
  fg_transaction_id BIGINT REFERENCES fg_transactions(id),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sal_return_lines_return ON sal_return_lines(return_id);

CREATE TABLE IF NOT EXISTS sal_cogs_records (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES sal_shipments(id),
  shipment_line_id BIGINT NOT NULL REFERENCES sal_shipment_lines(id),
  sales_order_id BIGINT NOT NULL REFERENCES sal_sales_orders(id),
  customer_id BIGINT NOT NULL REFERENCES sal_customers(id),
  channel TEXT NOT NULL,
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  product_id BIGINT REFERENCES md_products(id),
  fg_lot_id BIGINT NOT NULL REFERENCES fg_lots(id),
  source_location_id BIGINT NOT NULL REFERENCES md_storage_locations(id),
  quantity NUMERIC(18,6) NOT NULL,
  unit_cost_kyd_snapshot NUMERIC(18,6) NOT NULL,
  extended_cost_kyd NUMERIC(18,6) NOT NULL,
  recognition_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_cogs_shipment ON sal_cogs_records(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_sku ON sal_cogs_records(sku_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_customer ON sal_cogs_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_channel ON sal_cogs_records(channel);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_location ON sal_cogs_records(source_location_id);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_date ON sal_cogs_records(recognition_date);
CREATE INDEX IF NOT EXISTS idx_sal_cogs_product ON sal_cogs_records(product_id);
