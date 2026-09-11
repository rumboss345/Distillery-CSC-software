import { isPostgresAuthoritativeMode, usesServerApi } from '../db/production-mode';
import { queryAll } from './browser-adapter';
import { readTable } from './server-api-adapter';
import { isBootstrapLoaded } from './server-cache';

export async function listFromTable<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
): Promise<T[]> {
  if (usesServerApi()) {
    if (isPostgresAuthoritativeMode() && !isBootstrapLoaded()) {
      throw new Error('ERP server cache is not loaded. Wait for bootstrap before reading operational data.');
    }
    return (await readTable(table)) as T[];
  }

  return queryAll<T>(`SELECT * FROM ${table}`);
}

export function listFromTableSync<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
): T[] {
  if (usesServerApi()) {
    if (isPostgresAuthoritativeMode() && !isBootstrapLoaded()) {
      throw new Error('ERP server cache is not loaded. Wait for bootstrap before reading operational data.');
    }
    throw new Error(`Table "${table}" requires async server read in server API mode. Use listFromTable() instead.`);
  }

  return queryAll<T>(`SELECT * FROM ${table}`);
}
