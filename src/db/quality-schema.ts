/**
 * Phase 1K QA/QC — specifications, samples, test results, holds, COA & recall traceability.
 */

export const QUALITY_SCHEMA = `
CREATE TABLE IF NOT EXISTS qc_specifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spec_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  spec_type TEXT NOT NULL,
  sku_id INTEGER REFERENCES md_skus(id),
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  product_id INTEGER REFERENCES md_products(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Active',
  effective_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qc_spec_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  specification_id INTEGER NOT NULL REFERENCES qc_specifications(id) ON DELETE CASCADE,
  parameter_code TEXT NOT NULL,
  parameter_name TEXT NOT NULL,
  parameter_type TEXT NOT NULL DEFAULT 'numeric',
  min_value REAL,
  max_value REAL,
  target_value REAL,
  unit TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(specification_id, parameter_code)
);

CREATE TABLE IF NOT EXISTS qc_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hold_code TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  placed_at TEXT NOT NULL,
  placed_by TEXT,
  released_at TEXT,
  released_by TEXT,
  release_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qc_holds_entity ON qc_holds(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qc_holds_status ON qc_holds(status);

CREATE TABLE IF NOT EXISTS qc_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_code TEXT NOT NULL UNIQUE,
  specification_id INTEGER REFERENCES qc_specifications(id),
  sample_type TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id INTEGER NOT NULL,
  collected_at TEXT NOT NULL,
  collected_by TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  overall_pass_fail TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qc_samples_source ON qc_samples(source_entity_type, source_entity_id);

CREATE TABLE IF NOT EXISTS qc_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id INTEGER NOT NULL REFERENCES qc_samples(id) ON DELETE CASCADE,
  parameter_id INTEGER REFERENCES qc_spec_parameters(id),
  parameter_name TEXT NOT NULL,
  result_type TEXT NOT NULL,
  result_value TEXT,
  result_numeric REAL,
  pass_fail TEXT NOT NULL DEFAULT 'Pending',
  tested_at TEXT NOT NULL,
  tested_by TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_qc_test_results_sample ON qc_test_results(sample_id);

CREATE TABLE IF NOT EXISTS qc_coa_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coa_code TEXT NOT NULL UNIQUE,
  sample_id INTEGER NOT NULL REFERENCES qc_samples(id),
  specification_id INTEGER REFERENCES qc_specifications(id),
  status TEXT NOT NULL DEFAULT 'Draft',
  document_snapshot TEXT NOT NULL DEFAULT '',
  issued_at TEXT,
  issued_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qc_coa_sample ON qc_coa_documents(sample_id);
`;

export const QUALITY_V1K_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_qc_holds_entity ON qc_holds(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qc_samples_source ON qc_samples(source_entity_type, source_entity_id);
`;

export const QUALITY_V1K_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
