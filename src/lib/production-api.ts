import type { ProductionMigrationState } from '../../shared/production-state';
import { getStoredToken } from './auth-api';
import { exportDatabase } from '../db/database';

export interface ProductionStatus {
  databaseConfigured: boolean;
  databaseConnected: boolean;
  migrationState: ProductionMigrationState;
  statusMessage: string;
  browserAuthoritative: boolean;
  serverAuthoritative: boolean;
  serverApiCutoverReady: boolean;
  canActivateCentralDatabase: boolean;
  activateBlockedReason: string | null;
  canonicalLiquidUnit: 'L';
  abvConvention: 'percentage_0_100';
  gallonConversion: 'US_liquid_gallon';
  recordCounts: Record<string, number>;
  importMetadata: {
    lastImportAt: string | null;
    lastImportedByEmail: string | null;
    lastImportStatus: string | null;
    lastImportRunId: number | null;
  };
}

export interface ImportPreviewResponse {
  preview: {
    sourceLabel: string;
    tables: Record<string, number>;
    batchNumbers: Record<string, string[]>;
    warnings: string[];
  };
  importRunId: number;
  serverHasExistingData: boolean;
  requiresExplicitReplace: boolean;
  externalBackupRequired: boolean;
  message: string;
}

export interface ValidationReport {
  passed: boolean;
  rows: Array<{
    key: string;
    label: string;
    browser: number | string;
    server: number | string;
    difference: number | string;
    status: 'PASS' | 'FAIL' | 'WARN';
    critical: boolean;
  }>;
  batchNumbers: ValidationReport['rows'];
  tankBalances: Array<{
    tankId: number;
    tankName: string;
    browserVolumeLitres: number;
    serverVolumeLitres: number;
    browserAbv: number;
    serverAbv: number;
    status: 'PASS' | 'FAIL';
  }>;
}

async function productionFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 502 || res.status === 503) {
      throw new Error('Cannot reach the server or production database.');
    }
    throw new Error(data.error ?? `Production API failed (${res.status})`);
  }

  return data as T;
}

export async function fetchProductionStatus(): Promise<ProductionStatus> {
  return productionFetch<ProductionStatus>('/api/production/status');
}

export function exportBrowserDatabaseBase64(): string {
  const bytes = exportDatabase();
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function previewBrowserMigration(sourceLabel = 'browser_localStorage') {
  const databaseBase64 = exportBrowserDatabaseBase64();
  return productionFetch<ImportPreviewResponse>('/api/production/migration/preview', {
    method: 'POST',
    body: JSON.stringify({ databaseBase64, sourceLabel }),
  });
}

export async function importBrowserMigration(options: {
  replaceExisting: boolean;
  replaceConfirmationPhrase?: string;
  sourceLabel?: string;
  backupBase64?: string;
  externalBackupAcknowledged: boolean;
}) {
  const databaseBase64 = exportBrowserDatabaseBase64();
  return productionFetch<{
    message: string;
    migrationState: ProductionMigrationState;
    importRunId: number;
    validationReport: ValidationReport;
  }>(
    '/api/production/migration/import',
    {
      method: 'POST',
      body: JSON.stringify({
        databaseBase64,
        backupBase64: options.backupBase64 ?? databaseBase64,
        confirm: true,
        replaceExisting: options.replaceExisting,
        replaceConfirmationPhrase: options.replaceConfirmationPhrase,
        sourceLabel: options.sourceLabel ?? 'browser_localStorage',
        externalBackupAcknowledged: options.externalBackupAcknowledged,
      }),
    },
  );
}

export async function validateBrowserMigration() {
  const databaseBase64 = exportBrowserDatabaseBase64();
  return productionFetch<{ migrationState: ProductionMigrationState; report: ValidationReport; message: string }>(
    '/api/production/migration/validate',
    {
      method: 'POST',
      body: JSON.stringify({ databaseBase64 }),
    },
  );
}

export async function activateCentralDatabase(options: {
  confirm: boolean;
  override?: boolean;
  overrideReason?: string;
}) {
  const databaseBase64 = exportBrowserDatabaseBase64();
  return productionFetch<{ message: string; migrationState: ProductionMigrationState; reloadRequired: boolean }>(
    '/api/production/migration/activate',
    {
      method: 'POST',
      body: JSON.stringify({ ...options, databaseBase64 }),
    },
  );
}

export async function fetchMigrationHistory() {
  return productionFetch<{ imports: Array<Record<string, unknown>> }>('/api/production/migration/history');
}
