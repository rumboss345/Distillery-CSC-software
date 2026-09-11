import { getStoredToken } from './auth-api';
import { exportDatabase } from '../db/database';

export interface ProductionStatus {
  databaseConfigured: boolean;
  databaseConnected: boolean;
  productionInitialized: boolean;
  authoritativeSource: 'server' | 'browser_local';
  canonicalLiquidUnit: 'L';
  abvConvention: 'percentage_0_100';
  recordCounts: Record<string, number>;
  importMetadata: {
    lastImportAt: string | null;
    lastImportedByEmail: string | null;
    lastImportStatus: string | null;
  };
}

export interface ImportPreviewResponse {
  preview: {
    sourceLabel: string;
    tables: Record<string, number>;
    batchNumbers: {
      mash: string[];
      distillation: string[];
      blend: string[];
      bottling: string[];
    };
    warnings: string[];
  };
  importRunId: number;
  serverHasExistingData: boolean;
  requiresExplicitReplace: boolean;
  message: string;
}

async function productionFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
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
  sourceLabel?: string;
  backupBase64?: string;
}) {
  const databaseBase64 = exportBrowserDatabaseBase64();
  return productionFetch<{ message: string; importedCounts: Record<string, number> }>(
    '/api/production/migration/import',
    {
      method: 'POST',
      body: JSON.stringify({
        databaseBase64,
        backupBase64: options.backupBase64 ?? databaseBase64,
        confirm: true,
        replaceExisting: options.replaceExisting,
        sourceLabel: options.sourceLabel ?? 'browser_localStorage',
      }),
    },
  );
}

export async function fetchMigrationHistory() {
  return productionFetch<{ imports: Array<Record<string, unknown>> }>('/api/production/migration/history');
}
