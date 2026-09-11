/** Explicit production database migration / cutover states. */
export type ProductionMigrationState =
  | 'LOCAL_ONLY'
  | 'MIGRATION_READY'
  | 'MIGRATION_IMPORTED'
  | 'SERVER_READ_ONLY_VALIDATION'
  | 'SERVER_AUTHORITATIVE';

export const PRODUCTION_STATE_MESSAGES: Record<ProductionMigrationState, string> = {
  LOCAL_ONLY:
    'Browser-local production mode is active. PostgreSQL is not configured on the server.',
  MIGRATION_READY:
    'Central PostgreSQL is ready. Production screens still use the browser database until import and cutover.',
  MIGRATION_IMPORTED:
    'Central database imported but production screens are still operating from the browser database. Server cutover has NOT occurred.',
  SERVER_READ_ONLY_VALIDATION:
    'Migration validation completed. Production screens still use the browser database until an administrator activates the central database.',
  SERVER_AUTHORITATIVE:
    'Central PostgreSQL is the authoritative production database. Browser localStorage writes are disabled.',
};

export function isBrowserAuthoritative(state: ProductionMigrationState): boolean {
  return state === 'LOCAL_ONLY'
    || state === 'MIGRATION_READY'
    || state === 'MIGRATION_IMPORTED'
    || state === 'SERVER_READ_ONLY_VALIDATION';
}

export function isServerAuthoritative(state: ProductionMigrationState): boolean {
  return state === 'SERVER_AUTHORITATIVE';
}
