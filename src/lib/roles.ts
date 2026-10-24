export type AuthRole = 'owner' | 'admin' | 'user';

export const SITE_OWNER_EMAIL = 'nelson@rum.ky';

export const OWNER_CREATE_ERROR = 'Only an owner can create another owner.';
export const OWNER_RESET_ADMIN_ERROR = 'Only an owner can reset an administrator password.';
export const OWNER_RESET_DATA_ERROR = 'Only an owner can clear all data or empty all tanks.';
export const OWNER_REMOVE_ERROR = 'Only an owner can remove another owner.';
export const LAST_OWNER_ERROR = 'Keep at least one owner.';

/** The account that is always an owner. OWNER_EMAIL can override this in tests. */
export function siteOwnerEmail(): string {
  return (process.env.OWNER_EMAIL?.trim() || SITE_OWNER_EMAIL).toLowerCase();
}

export function isSiteOwnerEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase() === siteOwnerEmail());
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === 'owner';
}

/** Owners and administrators can open every page and confirm administrator actions. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function roleLabel(role: string | null | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Administrator';
  return 'User';
}

export function parseCreatedRole(value: unknown, actorRole: string): AuthRole {
  if (value === 'owner') {
    if (!isOwnerRole(actorRole)) throw new Error(OWNER_CREATE_ERROR);
    return 'owner';
  }
  if (value === 'admin') return 'admin';
  return 'user';
}
