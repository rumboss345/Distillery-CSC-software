/**
 * ERP tables in foreign-key safe import order (Phases 1B–1Q + legacy 003).
 * Generic importer copies rows preserving IDs where tables have SERIAL PKs.
 */

export interface ErpTableSpec {
  table: string;
  /** Skip if absent in browser export */
  optional?: boolean;
  /** Tables without SERIAL id — use natural key or skip id preservation */
  noSerialId?: boolean;
}

/** Import order: parents before children. */
export const ERP_IMPORT_TABLES: ErpTableSpec[] = [
  // Legacy production (003) — also handled by legacy importer; listed for ERP full import
  { table: 'inventory_categories', optional: true },
  { table: 'inventory_items', optional: true },
  { table: 'floor_plans', optional: true },
  { table: 'floor_equipment', optional: true },

  // 1B Master data
  { table: 'md_code_sequences', noSerialId: true },
  { table: 'md_lookup_values', optional: true },
  { table: 'md_units', optional: true },
  { table: 'md_unit_conversions', optional: true },
  { table: 'md_suppliers', optional: true },
  { table: 'md_supplier_classifications', optional: true },
  { table: 'md_products', optional: true },
  { table: 'md_skus', optional: true },
  { table: 'md_raw_materials', optional: true },
  { table: 'md_packaging_materials', optional: true },
  { table: 'md_bulk_spirits', optional: true },
  { table: 'md_storage_locations', optional: true },

  // 1C Recipes
  { table: 'rec_recipes', optional: true },
  { table: 'rec_recipe_versions', optional: true },
  { table: 'rec_recipe_ingredients', optional: true },
  { table: 'rec_recipe_packaging', optional: true },
  { table: 'rec_recipe_steps', optional: true },

  // 1D Liquid ledger
  { table: 'liq_liquid_lots', optional: true },
  { table: 'liq_tanks', optional: true },
  { table: 'liq_transactions', optional: true },
  { table: 'liq_reconciliations', optional: true },

  // 1E Production orders
  { table: 'prod_orders', optional: true },
  { table: 'prod_order_requirements', optional: true },
  { table: 'prod_batches', optional: true },
  { table: 'prod_batch_inputs', optional: true },
  { table: 'prod_batch_losses', optional: true },
  { table: 'prod_batch_steps', optional: true },
  { table: 'prod_batch_events', optional: true },

  // 1F Material + purchasing
  { table: 'mat_storage_bins', optional: true },
  { table: 'mat_lots', optional: true },
  { table: 'mat_item_uom_conversions', optional: true },
  { table: 'mat_transactions', optional: true },
  { table: 'mat_reconciliations', optional: true },
  { table: 'pur_purchase_orders', optional: true },
  { table: 'pur_purchase_order_lines', optional: true },
  { table: 'pur_receipts', optional: true },
  { table: 'pur_receipt_lines', optional: true },

  // 1G Costing
  { table: 'cost_landed_cost_documents', optional: true },
  { table: 'cost_landed_cost_lines', optional: true },
  { table: 'cost_material_lot_layers', optional: true },
  { table: 'cost_batch_snapshots', optional: true },
  { table: 'cost_liquid_layers', optional: true },
  { table: 'cost_liquid_movements', optional: true },
  { table: 'cost_adjustments', optional: true },

  // 1H Finished goods
  { table: 'pkg_runs', optional: true },
  { table: 'fg_lots', optional: true },
  { table: 'fg_transactions', optional: true },

  // 1I Multi-location
  { table: 'inv_transfer_documents', optional: true },
  { table: 'inv_transfer_lines', optional: true },
  { table: 'inv_cycle_counts', optional: true },
  { table: 'inv_cycle_count_lines', optional: true },
  { table: 'inv_barcodes', optional: true },

  // 1J Barrel aging
  { table: 'brl_barrels', optional: true },
  { table: 'brl_fills', optional: true },
  { table: 'brl_observations', optional: true },
  { table: 'brl_dumps', optional: true },
  { table: 'brl_dump_sources', optional: true },

  // 1K Quality
  { table: 'qc_specifications', optional: true },
  { table: 'qc_spec_parameters', optional: true },
  { table: 'qc_holds', optional: true },
  { table: 'qc_samples', optional: true },
  { table: 'qc_test_results', optional: true },
  { table: 'qc_coa_documents', optional: true },

  // 1L Maintenance
  { table: 'maint_pm_schedules', optional: true },
  { table: 'maint_work_orders', optional: true },
  { table: 'maint_downtime_records', optional: true },

  // 1M Planning
  { table: 'plan_demand_forecasts', optional: true },
  { table: 'plan_production_plans', optional: true },
  { table: 'plan_mrp_runs', optional: true },
  { table: 'plan_mrp_lines', optional: true },
  { table: 'plan_safety_stock', optional: true },
  { table: 'plan_schedule_slots', optional: true },

  // 1N Sales
  { table: 'sal_customers', optional: true },
  { table: 'sal_sales_orders', optional: true },
  { table: 'sal_sales_order_lines', optional: true },
  { table: 'sal_shipments', optional: true },
  { table: 'sal_shipment_lines', optional: true },
  { table: 'sal_returns', optional: true },
  { table: 'sal_return_lines', optional: true },
  { table: 'sal_cogs_records', optional: true },

  // 1P Administration
  { table: 'adm_erp_users', optional: true },
  { table: 'adm_audit_log', optional: true },
  { table: 'adm_documents', optional: true },

  // 1Q Accounting
  { table: 'acct_account_mappings', optional: true },
  { table: 'acct_events', optional: true },
  { table: 'acct_export_batches', optional: true },
  { table: 'acct_export_batch_lines', optional: true },
];

/** Reverse order for DELETE during replace import. */
export function erpTablesInDeleteOrder(): string[] {
  return [...ERP_IMPORT_TABLES].reverse().map((t) => t.table);
}
