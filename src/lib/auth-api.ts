import type { PermissionKey, ProcessStageKey } from './permissions';
import type { AuthRole } from './roles';
import { clearAdminApproval, setAdminApproval } from './admin-approval';

const TOKEN_KEY = 'distillery-tracker-auth-token';

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: AuthRole;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  permissions: PermissionKey[];
  processAssignments: ProcessStageKey[];
  /** The website settings recreate this administrator and replace the password on each start. */
  restoredFromSettings?: boolean;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  clearAdminApproval();
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
        'Cannot reach the server. Try again in a moment. If this continues, contact your administrator or check that the app service is running.',
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

/** `actions` are the production changes the administrator approves for the next few minutes. */
export async function verifyAdminCredentials(email: string, password: string, actions: string[] = []) {
  const result = await apiFetch<{ ok: true; email: string; approvalToken?: string; expiresInSeconds?: number }>(
    '/api/auth/verify-admin',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, actions }),
    },
  );
  if (result.approvalToken && result.expiresInSeconds) {
    setAdminApproval(result.approvalToken, actions, result.expiresInSeconds);
  }
  return result;
}

export async function requestPasswordReset(email: string) {
  return apiFetch<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  return apiFetch<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
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

export interface AssignableUser {
  id: number;
  email: string;
  name: string | null;
}

export async function fetchAssignableUsers() {
  return apiFetch<{ users: AssignableUser[] }>('/api/users/assignable');
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
  role?: AuthRole;
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
    password?: string;
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

export interface StaffMessage {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  created_at: string;
  read_at: string | null;
  sender_email: string;
  sender_name: string | null;
  recipient_email: string;
  recipient_name: string | null;
}

export async function fetchStaffMessageSummary() {
  return apiFetch<{ unreadCount: number }>('/api/messages/summary');
}

export async function fetchStaffMessages(folder: 'inbox' | 'sent' = 'inbox') {
  return apiFetch<{ messages: StaffMessage[] }>(`/api/messages?folder=${folder}`);
}

export async function fetchStaffMessageThread(staffA: number, staffB: number) {
  const params = new URLSearchParams({
    staffA: String(staffA),
    staffB: String(staffB),
  });
  return apiFetch<{ messages: StaffMessage[] }>(`/api/messages/thread?${params}`);
}

export async function fetchIncomingStaffMessages(afterId: number) {
  return apiFetch<{ messages: StaffMessage[] }>(`/api/messages/incoming?afterId=${afterId}`);
}

export async function sendStaffMessage(recipientId: number, body: string) {
  return apiFetch<{ message: StaffMessage }>('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ recipientId, body }),
  });
}

export async function sendStaffBroadcast(body: string) {
  return apiFetch<{ broadcast: true; recipientCount: number }>('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ broadcast: true, body }),
  });
}

export async function markStaffMessageRead(messageId: number) {
  return apiFetch<{ ok: true; unreadCount: number }>(`/api/messages/${messageId}/read`, {
    method: 'PATCH',
  });
}

export async function markAllStaffMessagesRead() {
  return apiFetch<{ updated: number; unreadCount: number }>('/api/messages/read-all', {
    method: 'POST',
  });
}
