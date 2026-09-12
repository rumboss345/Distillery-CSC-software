import type { PermissionKey, ProcessStageKey } from './permissions';

const TOKEN_KEY = 'distillery-tracker-auth-token';

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  permissions: PermissionKey[];
  processAssignments: ProcessStageKey[];
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 502 || res.status === 503) {
      throw new Error(
        'Cannot reach the server. If running locally, use npm run dev. On Render, check deploy logs and env vars (JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD).',
      );
    }
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return data as T;
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string, name?: string) {
  return apiFetch<{ message: string; email: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name: name || null }),
  });
}

export async function fetchMe() {
  return apiFetch<{ user: AuthUser }>('/api/auth/me');
}

export async function approveByToken(token: string) {
  return apiFetch<{ message: string; user: AuthUser }>('/api/auth/approve', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function fetchPendingUsers() {
  return apiFetch<{ users: AuthUser[] }>('/api/admin/pending-users');
}

export async function fetchAllUsers() {
  return apiFetch<{ users: AuthUser[] }>('/api/admin/users');
}

export interface ProcessAssignmentEntry {
  id: number;
  email: string;
  name: string | null;
}

export async function fetchProcessAssignments() {
  return apiFetch<{ assignments: Record<string, ProcessAssignmentEntry[]> }>(
    '/api/process/assignments',
  );
}

export async function createAdminUser(payload: {
  email: string;
  password: string;
  name?: string;
  permissions: PermissionKey[];
  processAssignments: ProcessStageKey[];
}) {
  return apiFetch<{ message: string; user: AuthUser }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUser(
  id: number,
  payload: {
    name?: string | null;
    permissions?: PermissionKey[];
    processAssignments?: ProcessStageKey[];
  },
) {
  return apiFetch<{ message: string; user: AuthUser }>(`/api/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminUser(id: number) {
  return apiFetch<{ message: string }>(`/api/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export async function approveUser(id: number) {
  return apiFetch<{ message: string; user: AuthUser }>(`/api/admin/users/${id}/approve`, {
    method: 'POST',
  });
}

export async function rejectUser(id: number) {
  return apiFetch<{ message: string; user: AuthUser }>(`/api/admin/users/${id}/reject`, {
    method: 'POST',
  });
}
