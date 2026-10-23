import { getStoredToken } from './auth-api';

export interface SharedDistilleryRecord {
  revision: number;
  updatedAt: string | null;
  clearedAt: string | null;
  database: string | null;
}

export class SharedRecordConflict extends Error {
  record: SharedDistilleryRecord;

  constructor(record: SharedDistilleryRecord) {
    super('The shared distillery record changed.');
    this.record = record;
  }
}

async function authorizedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  if (!token) throw new Error('Sign in before using the shared distillery record.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...options, headers });
}

export async function fetchSharedRevision(): Promise<{
  revision: number;
  updatedAt: string | null;
  clearedAt: string | null;
}> {
  const res = await authorizedFetch('/api/distillery-db/revision');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Could not read the shared distillery record.');
  return {
    revision: Number(data.revision) || 0,
    updatedAt: data.updatedAt ?? null,
    clearedAt: typeof data.clearedAt === 'string' ? data.clearedAt : null,
  };
}

export async function fetchSharedRecord(): Promise<SharedDistilleryRecord> {
  const res = await authorizedFetch('/api/distillery-db');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Could not read the shared distillery record.');
  return {
    revision: Number(data.revision) || 0,
    updatedAt: data.updatedAt ?? null,
    clearedAt: typeof data.clearedAt === 'string' ? data.clearedAt : null,
    database: typeof data.database === 'string' ? data.database : null,
  };
}

export async function putSharedRecord(baseRevision: number, database: string): Promise<number> {
  const res = await authorizedFetch('/api/distillery-db', {
    method: 'PUT',
    body: JSON.stringify({ baseRevision, database }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    throw new SharedRecordConflict({
      revision: Number(data.revision) || 0,
      updatedAt: data.updatedAt ?? null,
      clearedAt: typeof data.clearedAt === 'string' ? data.clearedAt : null,
      database: typeof data.database === 'string' ? data.database : null,
    });
  }
  if (!res.ok) throw new Error(data.error ?? 'Could not save the shared distillery record.');
  return Number(data.revision) || baseRevision + 1;
}

export async function deleteSharedRecord(): Promise<void> {
  const res = await authorizedFetch('/api/distillery-db', { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Could not clear the shared distillery record.');
}
