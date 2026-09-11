import type { DatabaseMode } from '../../shared/database-mode';
import type { ProductionMigrationState } from '../../shared/production-state';
import { fetchProductionStatus, type ProductionStatus } from '../lib/production-api';

const MODE_CACHE_KEY = 'csc-production-mode-cache';

let cachedStatus: ProductionStatus | null = null;

export function getCachedProductionStatus(): ProductionStatus | null {
  if (cachedStatus) return cachedStatus;
  try {
    const raw = sessionStorage.getItem(MODE_CACHE_KEY);
    if (raw) return JSON.parse(raw) as ProductionStatus;
  } catch {
    /* ignore */
  }
  return null;
}

export function setCachedProductionStatus(status: ProductionStatus): void {
  cachedStatus = status;
  sessionStorage.setItem(MODE_CACHE_KEY, JSON.stringify(status));
}

export async function refreshProductionMode(): Promise<ProductionStatus> {
  const status = await fetchProductionStatus();
  setCachedProductionStatus(status);
  return status;
}

export function getMigrationState(): ProductionMigrationState {
  return getCachedProductionStatus()?.migrationState ?? 'LOCAL_ONLY';
}

export function isBrowserAuthoritative(): boolean {
  const status = getCachedProductionStatus();
  if (!status) return true;
  return status.browserAuthoritative;
}

export function isServerAuthoritative(): boolean {
  return getCachedProductionStatus()?.serverAuthoritative ?? false;
}

export function getDatabaseModeFromCache(): DatabaseMode {
  return getCachedProductionStatus()?.databaseMode ?? 'browser_local';
}

export function isPostgresAuthoritativeMode(): boolean {
  return getDatabaseModeFromCache() === 'postgres_authoritative';
}

export function usesServerApi(): boolean {
  const status = getCachedProductionStatus();
  if (!status) return false;
  return status.databaseMode === 'postgres_authoritative' || status.serverAuthoritative;
}

export function canWriteToLocalDatabase(): boolean {
  return !isServerAuthoritative() && !isPostgresAuthoritativeMode();
}

export function getProductionWriteBlockedMessage(): string {
  if (isServerAuthoritative() || isPostgresAuthoritativeMode()) {
    return 'Central production database unavailable. Changes cannot be recorded.';
  }
  return 'Production write blocked.';
}
