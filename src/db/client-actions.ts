import { useEffect, useState } from 'react';
import { getStoredToken } from '../lib/auth-api';
import { backupFileName, downloadBytes, isSqliteFile } from '../lib/database-backup';
import { pgBackupError } from '../lib/pg-backup';
import {
  backupFileError,
  exportDatabase,
  initDatabase,
  isPostgresMode,
  replaceSharedDatabase,
  resetSharedDatabase,
} from './database';

export function useDatabaseReady() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load database'));
  }, []);

  return { ready, error };
}

export async function resetAllData(): Promise<void> {
  if (isPostgresMode()) {
    const token = getStoredToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch('/api/production', { method: 'DELETE', headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? 'Could not clear the shared distillery record.');
    window.location.reload();
    return;
  }
  await resetSharedDatabase();
  window.location.reload();
}

export async function downloadDatabaseBackup(prefix?: string): Promise<string> {
  if (isPostgresMode()) {
    const token = getStoredToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch('/api/production/backup', { headers });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? 'The backup could not be downloaded.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fileName = backupFileName(new Date(), prefix).replace(/\.sqlite$/, '.json');
    downloadBytes(bytes, fileName);
    return fileName;
  }
  const fileName = backupFileName(new Date(), prefix);
  downloadBytes(exportDatabase(), fileName);
  return fileName;
}

export async function checkDatabaseBackup(file: Blob): Promise<string | null> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (isPostgresMode()) {
    if (isSqliteFile(data)) return 'This file is a SQLite backup. Download a new backup from Administration.';
    try {
      return pgBackupError(JSON.parse(new TextDecoder().decode(data)));
    } catch {
      return 'This backup file could not be read.';
    }
  }
  return backupFileError(data);
}

export async function restoreDatabaseBackup(file: Blob): Promise<string | null> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (isPostgresMode()) {
    const checked = await checkDatabaseBackup(file);
    if (checked) return checked;
    const token = getStoredToken();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch('/api/production/restore', {
      method: 'POST',
      headers,
      body: new TextDecoder().decode(data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return body.error ?? 'The backup could not be restored.';
    window.location.reload();
    return null;
  }
  const error = await backupFileError(data);
  if (error) return error;
  try {
    await replaceSharedDatabase(data);
  } catch (err) {
    return err instanceof Error ? err.message : 'The backup could not be saved to the shared record.';
  }
  window.location.reload();
  return null;
}

export type AuditEvent = {
  id: number;
  email: string;
  action: string;
  summary: string;
  created_at: string;
};

export async function fetchAuditEvents(): Promise<{ events: AuditEvent[]; archived: AuditEvent[] }> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch('/api/production/audit', { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { events: [], archived: [] };
  return {
    events: Array.isArray(body.events) ? body.events : [],
    archived: Array.isArray(body.archived) ? body.archived : [],
  };
}
