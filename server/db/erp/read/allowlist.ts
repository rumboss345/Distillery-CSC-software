import { ERP_IMPORT_TABLES } from '../../../services/sqljs-import/erp-table-registry.js';

/** Tables safe for authenticated read-only ERP API queries. */
export const ALLOWLISTED_ERP_TABLES: readonly string[] = ERP_IMPORT_TABLES.map((spec) => spec.table);

const allowlistSet = new Set(ALLOWLISTED_ERP_TABLES);

export function isAllowlistedErpTable(table: string): boolean {
  return allowlistSet.has(table);
}
