/**
 * Phase 1O Management Dashboard, Reports & KPI Analytics — browser sql.js schema.
 * Views expose ledger-authoritative transaction subsets only (never legacy + ledger mixed).
 */

export const REPORTING_SCHEMA = `
CREATE VIEW IF NOT EXISTS rpt_v_mat_ledger_tx AS
SELECT t.*
FROM mat_transactions t
JOIN mat_lots l ON l.id = t.material_lot_id
LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id AND l.material_type = 'RAW_MATERIAL'
LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id AND l.material_type = 'PACKAGING_MATERIAL'
WHERE t.reversal_of_transaction_id IS NULL
  AND t.id NOT IN (
    SELECT reversal_of_transaction_id FROM mat_transactions WHERE reversal_of_transaction_id IS NOT NULL
  )
  AND (
    (l.material_type = 'RAW_MATERIAL' AND rm.inventory_tracking_mode = 'LEDGER')
    OR (l.material_type = 'PACKAGING_MATERIAL' AND pm.inventory_tracking_mode = 'LEDGER')
  );

CREATE VIEW IF NOT EXISTS rpt_v_liq_ledger_tx AS
SELECT t.*
FROM liq_transactions t
WHERE t.reversal_of_transaction_id IS NULL
  AND t.id NOT IN (
    SELECT reversal_of_transaction_id FROM liq_transactions WHERE reversal_of_transaction_id IS NOT NULL
  )
  AND (
    (t.source_tank_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM liq_tanks tk WHERE tk.id = t.source_tank_id AND tk.tracking_mode = 'LEDGER'
    ))
    OR (t.destination_tank_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM liq_tanks tk WHERE tk.id = t.destination_tank_id AND tk.tracking_mode = 'LEDGER'
    ))
  );

CREATE VIEW IF NOT EXISTS rpt_v_fg_ledger_tx AS
SELECT t.*
FROM fg_transactions t
WHERE t.reversal_of_transaction_id IS NULL
  AND t.id NOT IN (
    SELECT reversal_of_transaction_id FROM fg_transactions WHERE reversal_of_transaction_id IS NOT NULL
  );
`;

export const REPORTING_V1O_MIGRATION = `
DROP VIEW IF EXISTS rpt_v_fg_ledger_tx;
DROP VIEW IF EXISTS rpt_v_liq_ledger_tx;
DROP VIEW IF EXISTS rpt_v_mat_ledger_tx;
${REPORTING_SCHEMA}
`;
