/**
 * Step 1A — staged database authority modes.
 * Controlled via DATABASE_MODE env var on the server.
 */

export const DATABASE_MODES = [
  'browser_local',
  'dual_validation',
  'postgres_authoritative',
] as const;

export type DatabaseMode = (typeof DATABASE_MODES)[number];

export const DATABASE_MODE_LABELS: Record<DatabaseMode, string> = {
  browser_local: 'Browser-local authoritative (default when PostgreSQL inactive)',
  dual_validation: 'PostgreSQL mirror with validation — browser still authoritative',
  postgres_authoritative: 'PostgreSQL authoritative — all ERP writes via server API',
};

export function parseDatabaseMode(raw: string | undefined | null): DatabaseMode {
  const normalized = (raw ?? 'browser_local').trim().toLowerCase();
  if (normalized === 'dual_validation') return 'dual_validation';
  if (normalized === 'postgres_authoritative') return 'postgres_authoritative';
  return 'browser_local';
}

/** Browser may write locally when not in postgres_authoritative cutover state. */
export function browserWritesAllowed(mode: DatabaseMode, migrationState: string): boolean {
  if (mode === 'postgres_authoritative') return false;
  if (migrationState === 'SERVER_AUTHORITATIVE') return false;
  return true;
}

/** Server ERP API is required for writes when postgres_authoritative or after cutover. */
export function serverWritesRequired(mode: DatabaseMode, migrationState: string): boolean {
  return mode === 'postgres_authoritative' || migrationState === 'SERVER_AUTHORITATIVE';
}

/** Dual validation compares PG results without blocking browser authority. */
export function dualValidationEnabled(mode: DatabaseMode): boolean {
  return mode === 'dual_validation';
}
