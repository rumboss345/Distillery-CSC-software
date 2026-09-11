import {
  getDatabaseModeFromCache,
  usesServerApi,
} from '../db/production-mode';

let sqlJsLegacyOnly = false;

export function setSqlJsLegacyOnly(value: boolean): void {
  sqlJsLegacyOnly = value;
}

export function isSqlJsLegacyOnly(): boolean {
  return sqlJsLegacyOnly;
}

export { getDatabaseModeFromCache };

export function shouldUseServerApi(): boolean {
  return usesServerApi();
}

export function shouldUseBrowserLocal(): boolean {
  return !shouldUseServerApi();
}
