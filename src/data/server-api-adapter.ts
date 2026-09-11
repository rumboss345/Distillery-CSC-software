import { getStoredToken } from '../lib/auth-api';
import {
  getCachedTableRows,
  mergeTableIntoCache,
  setBootstrapCache,
  type ErpBootstrapPayload,
} from './server-cache';

let bootstrapPromise: Promise<ErpBootstrapPayload> | null = null;

export async function erpFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 502 || res.status === 503) {
      throw new Error('Cannot reach the server or ERP database.');
    }
    throw new Error((data as { error?: string }).error ?? `ERP API failed (${res.status})`);
  }

  return data as T;
}

export async function bootstrapErpCache(): Promise<ErpBootstrapPayload> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = erpFetch<ErpBootstrapPayload>('/api/erp/bootstrap').then((data) => {
    setBootstrapCache(data);
    return data;
  }).finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}

export async function readTable(table: string): Promise<Record<string, unknown>[]> {
  const cached = getCachedTableRows(table);
  if (cached) return cached;

  const response = await erpFetch<{ rows: Record<string, unknown>[] }>(
    `/api/erp/read/${encodeURIComponent(table)}`,
  );
  mergeTableIntoCache(table, response.rows);
  return response.rows;
}

export async function mutate<T = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return erpFetch<T>(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
