import * as sqliteAuth from '../db.js';
import type { User } from './auth-types.js';

export function initializeLocalAuthDatabase(): void {
  sqliteAuth.initializeAuthDatabase();
}

export function syncLocalAdminFromEnv(): void {
  sqliteAuth.syncAdminFromEnv();
}

export function getLocalUserCount(): number {
  return sqliteAuth.getUserCount();
}

function toUser(row: sqliteAuth.User): User {
  return {
    ...row,
    is_active: true,
    updated_at: row.created_at,
  };
}

export function getLocalUserByEmail(email: string): User | undefined {
  const row = sqliteAuth.getUserByEmail(email);
  return row ? toUser(row) : undefined;
}

export function getLocalUserById(id: number): User | undefined {
  const row = sqliteAuth.getUserById(id);
  return row ? toUser(row) : undefined;
}

export function getLocalUserByApprovalToken(token: string): User | undefined {
  const row = sqliteAuth.getUserByApprovalToken(token);
  return row ? toUser(row) : undefined;
}

export function createLocalUser(email: string, passwordHash: string, name: string | null): User {
  return toUser(sqliteAuth.createUser(email, passwordHash, name));
}

export function approveLocalUserByToken(token: string): User | null {
  const row = sqliteAuth.approveUserByToken(token);
  return row ? toUser(row) : null;
}

export function approveLocalUserById(id: number): User | null {
  const row = sqliteAuth.approveUserById(id);
  return row ? toUser(row) : null;
}

export function rejectLocalUserById(id: number): User | null {
  const row = sqliteAuth.rejectUserById(id);
  return row ? toUser(row) : null;
}

export function listLocalPendingUsers() {
  return sqliteAuth.listPendingUsers().map((u) => ({
    ...u,
    is_active: true,
    updated_at: u.created_at,
  }));
}

export function resetLocalAdminAccount(email: string, password: string, name = 'Admin'): void {
  sqliteAuth.resetAdminAccount(email, password, name);
}
