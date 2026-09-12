-- Phase 1K QA/QC: specifications, samples, test results, holds, COA & recall traceability.

CREATE TABLE IF NOT EXISTS qc_specifications (
  id BIGSERIAL PRIMARY KEY,
  spec_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  spec_type TEXT NOT NULL,
  sku_id BIGINT REFERENCES md_skus(id),
  raw_material_id BIGINT REFERENCES md_raw_materials(id),
  packaging_material_id BIGINT REFERENCES md_packaging_materials(id),
  product_id BIGINT REFERENCES md_products(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Active',
  effective_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_spec_parameters (
  id BIGSERIAL PRIMARY KEY,
  specification_id BIGINT NOT NULL REFERENCES qc_specifications(id) ON DELETE CASCADE,
  parameter_code TEXT NOT NULL,
  parameter_name TEXT NOT NULL,
  parameter_type TEXT NOT NULL DEFAULT 'numeric',
  min_value NUMERIC(18,6),
  max_value NUMERIC(18,6),
  target_value NUMERIC(18,6),
  unit TEXT,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(specification_id, parameter_code)
);

CREATE TABLE IF NOT EXISTS qc_holds (
  id BIGSERIAL PRIMARY KEY,
  hold_code TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  placed_at TIMESTAMPTZ NOT NULL,
  placed_by TEXT,
  released_at TIMESTAMPTZ,
  released_by TEXT,
  release_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_holds_entity ON qc_holds(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qc_holds_status ON qc_holds(status);

CREATE TABLE IF NOT EXISTS qc_samples (
  id BIGSERIAL PRIMARY KEY,
  sample_code TEXT NOT NULL UNIQUE,
  specification_id BIGINT REFERENCES qc_specifications(id),
  sample_type TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id BIGINT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  collected_by TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  overall_pass_fail TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_samples_source ON qc_samples(source_entity_type, source_entity_id);

CREATE TABLE IF NOT EXISTS qc_test_results (
  id BIGSERIAL PRIMARY KEY,
  sample_id BIGINT NOT NULL REFERENCES qc_samples(id) ON DELETE CASCADE,
  parameter_id BIGINT REFERENCES qc_spec_parameters(id),
  parameter_name TEXT NOT NULL,
  result_type TEXT NOT NULL,
  result_value TEXT,
  result_numeric NUMERIC(18,6),
  pass_fail TEXT NOT NULL DEFAULT 'Pending',
  tested_at TIMESTAMPTZ NOT NULL,
  tested_by TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_qc_test_results_sample ON qc_test_results(sample_id);

CREATE TABLE IF NOT EXISTS qc_coa_documents (
  id BIGSERIAL PRIMARY KEY,
  coa_code TEXT NOT NULL UNIQUE,
  sample_id BIGINT NOT NULL REFERENCES qc_samples(id),
  specification_id BIGINT REFERENCES qc_specifications(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  document_snapshot TEXT NOT NULL DEFAULT '',
  issued_at TIMESTAMPTZ,
  issued_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_coa_sample ON qc_coa_documents(sample_id);
