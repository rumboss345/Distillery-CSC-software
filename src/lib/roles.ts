export type AuthRole = 'owner' | 'admin' | 'manager' | 'user';

export const OWNER_CREATE_ERROR = 'Only an owner can create another owner.';
export const RESERVED_AUTH_EMAIL_ERROR =
  'This email address is reserved for distillery administration and cannot be used for self-registration.';
export const OWNER_RESET_ADMIN_ERROR = 'Only an owner can reset an administrator password.';
export const OWNER_RESET_DATA_ERROR = 'Only an owner can clear all data or empty all tanks.';
export const OWNER_REMOVE_ERROR = 'Only an owner can remove another owner.';
export const LAST_OWNER_ERROR = 'Keep at least one owner.';

/**
 * Owner account promoted on server start. Set OWNER_EMAIL in production;
 * when unset, ADMIN_EMAIL is used so existing Render setups keep one owner.
 */
export function siteOwnerEmail(): string {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (owner) return owner;
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
}

export function isSiteOwnerEmail(email: string | null | undefined): boolean {
  const owner = siteOwnerEmail();
  if (!owner) return false;
  return Boolean(email && email.trim().toLowerCase() === owner);
}

/** Emails provisioned from environment; public registration must not claim them. */
export function reservedAuthEmails(): string[] {
  const emails = new Set<string>();
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (owner) emails.add(owner);
  if (admin) emails.add(admin);
  return [...emails];
}

export function isReservedAuthEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return reservedAuthEmails().includes(normalized);
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === 'owner';
}

/** Owners and administrators can open every page and confirm administrator actions. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'manager';
}

/**
 * Production managers open every production page and work every process stage,
 * but cannot manage users, confirm administrator actions, or clear data.
 */
export function hasFullProductionAccess(role: string | null | undefined): boolean {
  return isAdminRole(role) || isManagerRole(role);
}

export function roleLabel(role: string | null | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Administrator';
  if (role === 'manager') return 'Production manager';
  return 'User';
}

export function parseCreatedRole(value: unknown, actorRole: string): AuthRole {
  if (value === 'owner') {
    if (!isOwnerRole(actorRole)) throw new Error(OWNER_CREATE_ERROR);
    return 'owner';
  }
  if (value === 'admin') return 'admin';
  if (value === 'manager') return 'manager';
  return 'user';
}

/** Staff roles an administrator can switch between on an existing account. */
export function isStaffRole(role: string | null | undefined): role is 'manager' | 'user' {
  return role === 'manager' || role === 'user';
}

export type DashboardView = 'owner' | 'manager' | 'operator';

/** Owners and administrators see the business view; managers the production view; everyone else their own work. */
export function dashboardViewForRole(role: string | null | undefined): DashboardView {
  if (isAdminRole(role)) return 'owner';
  if (isManagerRole(role)) return 'manager';
  return 'operator';
}
