import { getStoredToken } from '../lib/auth-api';
import { isPostgresAuthoritativeMode } from '../db/production-mode';
import { invalidateErpCache } from './server-cache';
import { clearHydrationState } from './server-cache-hydrator';
import { bootstrapErpCache } from './server-api-adapter';

export type ServerWriteOperation =
  | 'material.postTransaction'
  | 'material.transfer'
  | 'material.openingBalance'
  | 'liquid.postTransaction'
  | 'liquid.transfer'
  | 'finishedGoods.transfer'
  | 'finishedGoods.shipment'
  | 'sales.postShipment'
  | 'quality.placeHold'
  | 'quality.releaseHold'
  | 'warehouse.releaseTransfer'
  | 'warehouse.receiveTransfer'
  | 'warehouse.createCycleCount'
  | 'warehouse.recordCycleCount'
  | 'warehouse.postCycleCount'
  | 'production.recordBatchInput'
  | 'production.completeBatch'
  | 'barrel.fill'
  | 'barrel.dump'
  | 'accounting.createExportBatch';

interface WriteRoute {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string | ((payload: Record<string, unknown>) => string);
}

const WRITE_ROUTES: Record<ServerWriteOperation, WriteRoute> = {
  'material.postTransaction': { method: 'POST', path: '/api/erp/material/transactions' },
  'material.transfer': { method: 'POST', path: '/api/erp/material/transfer' },
  'material.openingBalance': { method: 'POST', path: '/api/erp/material/opening-balance' },
  'liquid.postTransaction': { method: 'POST', path: '/api/erp/liquid/transactions' },
  'liquid.transfer': { method: 'POST', path: '/api/erp/liquid/transfer' },
  'finishedGoods.transfer': { method: 'POST', path: '/api/erp/finished-goods/transfer' },
  'finishedGoods.shipment': { method: 'POST', path: '/api/erp/finished-goods/shipment' },
  'sales.postShipment': {
    method: 'POST',
    path: (p) => `/api/erp/sales/shipments/${p.shipmentId}/post`,
  },
  'quality.placeHold': { method: 'POST', path: '/api/erp/quality/holds' },
  'quality.releaseHold': {
    method: 'POST',
    path: (p) => `/api/erp/quality/holds/${p.holdId}/release`,
  },
  'warehouse.releaseTransfer': {
    method: 'POST',
    path: (p) => `/api/erp/warehouse/transfers/${p.transferId}/release`,
  },
  'warehouse.receiveTransfer': {
    method: 'POST',
    path: (p) => `/api/erp/warehouse/transfers/${p.transferId}/receive`,
  },
  'warehouse.createCycleCount': { method: 'POST', path: '/api/erp/warehouse/cycle-counts' },
  'warehouse.recordCycleCount': {
    method: 'POST',
    path: (p) => `/api/erp/warehouse/cycle-counts/lines/${p.lineId}/count`,
  },
  'warehouse.postCycleCount': {
    method: 'POST',
    path: (p) => `/api/erp/warehouse/cycle-counts/${p.cycleCountId}/post`,
  },
  'production.recordBatchInput': {
    method: 'POST',
    path: (p) => `/api/erp/production/batches/${p.batchId}/inputs`,
  },
  'production.completeBatch': {
    method: 'POST',
    path: (p) => `/api/erp/production/batches/${p.batchId}/complete`,
  },
  'barrel.fill': { method: 'POST', path: '/api/erp/barrel/fills' },
  'barrel.dump': {
    method: 'POST',
    path: (p) => `/api/erp/barrel/fills/${p.fillId}/dump`,
  },
  'accounting.createExportBatch': { method: 'POST', path: '/api/erp/accounting/export-batches' },
};

function syncServerFetch<T>(path: string, method: string, body?: unknown): T {
  const xhr = new XMLHttpRequest();
  xhr.open(method, path, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  const token = getStoredToken();
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.send(body !== undefined ? JSON.stringify(body) : undefined);

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(xhr.responseText) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  if (xhr.status >= 400) {
    throw new Error(typeof data.error === 'string' ? data.error : `Server write failed (${xhr.status})`);
  }

  return data as T;
}

async function refreshServerCacheAfterWrite(): Promise<void> {
  invalidateErpCache();
  clearHydrationState();
  await bootstrapErpCache();
}

export function isServerWriteMode(): boolean {
  return isPostgresAuthoritativeMode();
}

/**
 * Execute a server-authoritative write and refresh the local server cache.
 * Returns null when not in postgres_authoritative mode (caller should use local sql.js).
 */
export function tryServerWrite<T>(
  operation: ServerWriteOperation,
  payload: Record<string, unknown>,
  mapResponse: (response: Record<string, unknown>) => T,
): T | null {
  if (!isServerWriteMode()) return null;

  const route = WRITE_ROUTES[operation];
  const path = typeof route.path === 'function' ? route.path(payload) : route.path;
  const response = syncServerFetch<Record<string, unknown>>(path, route.method, payload);
  mapResponse(response);

  // Refresh cache synchronously is not possible — schedule async refresh.
  // Callers should invoke refreshServerCache() after mutations in UI hooks.
  void refreshServerCacheAfterWrite();

  return mapResponse(response);
}

export async function refreshServerCache(): Promise<void> {
  if (!isServerWriteMode()) return;
  invalidateErpCache();
  clearHydrationState();
  await bootstrapErpCache();
}

export function assertNoLocalErpWrite(sql: string): void {
  if (!isServerWriteMode()) return;
  const normalized = sql.trim().toUpperCase();
  const isWrite =
    normalized.startsWith('INSERT')
    || normalized.startsWith('UPDATE')
    || normalized.startsWith('DELETE')
    || normalized.startsWith('REPLACE');
  if (!isWrite) return;

  const erpTables = ['mat_', 'liq_', 'fg_', 'prod_', 'pur_', 'cost_', 'pkg_', 'inv_', 'brl_', 'qc_', 'sal_', 'acct_', 'adm_', 'plan_', 'maint_', 'md_', 'rec_'];
  const touchesErp = erpTables.some((prefix) => normalized.includes(prefix.toUpperCase().replace('_', '')) || sql.includes(prefix));
  if (touchesErp || /(?:INSERT|UPDATE|DELETE)\s+(?:OR\s+\w+\s+)?(?:INTO\s+)?([a-z_]+)/i.test(sql)) {
    throw new Error('Central production database unavailable. Changes cannot be recorded.');
  }
}
