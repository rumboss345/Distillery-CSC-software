-- Phase 1G costing, landed cost allocation & COGS foundation mirror (PostgreSQL inactive until Step 1A cutover).

CREATE TABLE IF NOT EXISTS cost_landed_cost_documents (
  id BIGSERIAL PRIMARY KEY,
  landed_cost_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Draft',
  supplier_id BIGINT REFERENCES md_suppliers(id),
  purchase_order_id BIGINT REFERENCES pur_purchase_orders(id),
  receipt_id BIGINT REFERENCES pur_receipts(id),
  shipment_reference TEXT,
  container_number TEXT,
  bill_of_lading TEXT,
  currency TEXT NOT NULL DEFAULT 'KYD',
  exchange_rate_to_kyd NUMERIC(18,6) NOT NULL DEFAULT 1,
  effective_date TIMESTAMPTZ NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cost_landed_cost_components (
  id BIGSERIAL PRIMARY KEY,
  landed_cost_document_id BIGINT NOT NULL REFERENCES cost_landed_cost_documents(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  original_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KYD',
  exchange_rate_to_kyd NUMERIC(18,6) NOT NULL DEFAULT 1,
  kyd_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  allocation_method TEXT NOT NULL DEFAULT 'BY_PURCHASE_VALUE',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cost_landed_cost_allocations (
  id BIGSERIAL PRIMARY KEY,
  landed_cost_document_id BIGINT NOT NULL REFERENCES cost_landed_cost_documents(id),
  component_id BIGINT NOT NULL REFERENCES cost_landed_cost_components(id),
  receipt_id BIGINT REFERENCES pur_receipts(id),
  receipt_line_id BIGINT REFERENCES pur_receipt_lines(id),
  material_lot_id BIGINT REFERENCES mat_lots(id),
  allocation_basis TEXT NOT NULL,
  basis_value NUMERIC(18,6),
  allocation_percent NUMERIC(18,6),
  allocated_original_amount NUMERIC(18,6),
  allocated_kyd_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_material_lot_layers (
  id BIGSERIAL PRIMARY KEY,
  material_lot_id BIGINT NOT NULL REFERENCES mat_lots(id),
  source_type TEXT NOT NULL,
  source_id BIGINT,
  effective_date TIMESTAMPTZ NOT NULL,
  quantity_basis NUMERIC(18,6) NOT NULL DEFAULT 0,
  purchase_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  landed_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  unit_cost_kyd NUMERIC(18,6),
  currency_snapshot TEXT,
  exchange_rate_snapshot NUMERIC(18,6),
  cost_status TEXT NOT NULL DEFAULT 'VALUED',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_material_consumptions (
  id BIGSERIAL PRIMARY KEY,
  material_transaction_id BIGINT NOT NULL REFERENCES mat_transactions(id),
  production_order_id BIGINT REFERENCES prod_orders(id),
  production_batch_id BIGINT REFERENCES prod_batches(id),
  material_lot_id BIGINT NOT NULL REFERENCES mat_lots(id),
  base_quantity_consumed NUMERIC(18,6) NOT NULL,
  unit_cost_kyd_snapshot NUMERIC(18,6),
  extended_cost_kyd NUMERIC(18,6),
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  source_cost_layer_id BIGINT REFERENCES cost_material_lot_layers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_liquid_lot_layers (
  id BIGSERIAL PRIMARY KEY,
  liquid_lot_id BIGINT NOT NULL REFERENCES liq_lots(id),
  source_type TEXT NOT NULL,
  source_id BIGINT,
  production_batch_id BIGINT REFERENCES prod_batches(id),
  effective_date TIMESTAMPTZ NOT NULL,
  volume_litres NUMERIC(18,6) NOT NULL DEFAULT 0,
  lpa NUMERIC(18,6) NOT NULL DEFAULT 0,
  input_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  conversion_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  cost_per_litre_kyd NUMERIC(18,6),
  cost_per_lpa_kyd NUMERIC(18,6),
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_batch_conversion_costs (
  id BIGSERIAL PRIMARY KEY,
  production_batch_id BIGINT NOT NULL REFERENCES prod_batches(id),
  cost_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(18,6),
  rate NUMERIC(18,6),
  original_currency TEXT NOT NULL DEFAULT 'KYD',
  original_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  exchange_rate_to_kyd NUMERIC(18,6) NOT NULL DEFAULT 1,
  amount_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cost_batch_snapshots (
  id BIGSERIAL PRIMARY KEY,
  production_batch_id BIGINT NOT NULL REFERENCES prod_batches(id),
  snapshot_type TEXT NOT NULL DEFAULT 'Preliminary',
  status TEXT NOT NULL DEFAULT 'Draft',
  material_cost_kyd NUMERIC(18,6),
  liquid_cost_kyd NUMERIC(18,6),
  conversion_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_cost_kyd NUMERIC(18,6),
  output_volume_litres NUMERIC(18,6),
  output_lpa NUMERIC(18,6),
  cost_per_litre_kyd NUMERIC(18,6),
  cost_per_lpa_kyd NUMERIC(18,6),
  planned_cost_kyd NUMERIC(18,6),
  variance_kyd NUMERIC(18,6),
  variance_percent NUMERIC(18,6),
  unvalued_input_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cost_production_outputs (
  id BIGSERIAL PRIMARY KEY,
  production_batch_id BIGINT NOT NULL REFERENCES prod_batches(id),
  output_type TEXT NOT NULL DEFAULT 'Liquid Lot',
  liquid_lot_id BIGINT REFERENCES liq_lots(id),
  sku_id BIGINT REFERENCES md_skus(id),
  finished_goods_lot_id BIGINT,
  quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'L',
  base_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  base_unit TEXT NOT NULL DEFAULT 'L',
  allocated_batch_cost_kyd NUMERIC(18,6),
  unit_cost_kyd NUMERIC(18,6),
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_adjustments (
  id BIGSERIAL PRIMARY KEY,
  adjustment_code TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL,
  target_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  amount_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  effective_date TIMESTAMPTZ NOT NULL,
  source_document_type TEXT,
  source_document_id BIGINT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversal_of_adjustment_id BIGINT REFERENCES cost_adjustments(id)
);

CREATE TABLE IF NOT EXISTS cost_post_consumption_flags (
  id BIGSERIAL PRIMARY KEY,
  material_lot_id BIGINT REFERENCES mat_lots(id),
  production_batch_id BIGINT REFERENCES prod_batches(id),
  landed_cost_document_id BIGINT REFERENCES cost_landed_cost_documents(id),
  adjustment_amount_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending Review',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
