import { getStoredToken } from '../lib/auth-api';

interface ProductionBridge {
  revision: () => number;
  apply: (snapshot: string, revision: number) => void;
  notify: (message: string) => void;
  dismiss?: () => void;
}

let bridge: ProductionBridge | null = null;

export function configureProductionBridge(next: ProductionBridge): void {
  bridge = next;
}

export function invokeProductionMutation(name: string, args: unknown[]): unknown {
  if (!bridge) throw new Error('PostgreSQL is not ready.');
  const token = getStoredToken();
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/production/mutate', false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.send(JSON.stringify({ name, args, baseRevision: bridge.revision() }));
  const body = xhr.responseText ? JSON.parse(xhr.responseText) as {
    error?: string;
    result?: unknown;
    revision?: number;
    database?: string;
  } : {};
  if (xhr.status === 409 && body.database && body.revision != null) {
    bridge.apply(body.database, body.revision);
    bridge.notify(body.error ?? 'Someone else saved this record. The screen now shows their version.');
    throw new Error(body.error ?? 'Someone else saved this record. The screen now shows their version.');
  }
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error(body.error ?? 'The change could not be saved.');
  }
  if (body.database && body.revision != null) bridge.apply(body.database, body.revision);
  bridge.dismiss?.();
  return body.result;
}

export async function fetchProductionSnapshot(): Promise<{ revision: number; database: string }> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch('/api/production/snapshot', { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'The shared distillery record is not reachable.');
  return body;
}

export async function fetchProductionRevision(): Promise<number> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch('/api/production/revision', { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'The shared distillery record is not reachable.');
  return Number(body.revision ?? 0);
}
