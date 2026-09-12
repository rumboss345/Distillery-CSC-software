-- Phase 1O Management Dashboard, Reports & KPI Analytics (PostgreSQL inactive until Step 1A).
-- Views expose ledger-authoritative transaction subsets only — never legacy + ledger mixed.

CREATE OR REPLACE VIEW rpt_v_mat_ledger_tx AS
SELECT t.*
FROM mat_transactions t
JOIN mat_lots l ON l.id = t.material_lot_id
LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id AND l.material_type = 'RAW_MATERIAL'
LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id AND l.material_type = 'PACKAGING_MATERIAL'
WHERE t.reversal_of_transaction_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM mat_transactions rev WHERE rev.reversal_of_transaction_id = t.id
  )
  AND (
    (l.material_type = 'RAW_MATERIAL' AND rm.inventory_tracking_mode = 'LEDGER')
    OR (l.material_type = 'PACKAGING_MATERIAL' AND pm.inventory_tracking_mode = 'LEDGER')
  );

CREATE OR REPLACE VIEW rpt_v_liq_ledger_tx AS
SELECT t.*
FROM liq_transactions t
WHERE t.reversal_of_transaction_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM liq_transactions rev WHERE rev.reversal_of_transaction_id = t.id
  )
  AND (
    (t.source_tank_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM liq_tanks tk WHERE tk.id = t.source_tank_id AND tk.tracking_mode = 'LEDGER'
    ))
    OR (t.destination_tank_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM liq_tanks tk WHERE tk.id = t.destination_tank_id AND tk.tracking_mode = 'LEDGER'
    ))
  );

CREATE OR REPLACE VIEW rpt_v_fg_ledger_tx AS
SELECT t.*
FROM fg_transactions t
WHERE t.reversal_of_transaction_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM fg_transactions rev WHERE rev.reversal_of_transaction_id = t.id
  );
