export interface ErpBootstrapPayload {
  tables: Record<string, Record<string, unknown>[]>;
  bootstrappedAt: string;
}

let bootstrapData: ErpBootstrapPayload | null = null;

export function getBootstrapCache(): ErpBootstrapPayload | null {
  return bootstrapData;
}

export function isBootstrapLoaded(): boolean {
  return bootstrapData !== null;
}

export function getCachedTableRows(table: string): Record<string, unknown>[] | null {
  if (!bootstrapData) return null;
  if (Object.prototype.hasOwnProperty.call(bootstrapData.tables, table)) {
    return bootstrapData.tables[table];
  }
  return null;
}

export function setBootstrapCache(data: ErpBootstrapPayload): void {
  bootstrapData = data;
}

export function mergeTableIntoCache(table: string, rows: Record<string, unknown>[]): void {
  if (!bootstrapData) {
    bootstrapData = { tables: { [table]: rows }, bootstrappedAt: new Date().toISOString() };
    return;
  }
  bootstrapData.tables[table] = rows;
}

export function invalidateErpCache(): void {
  bootstrapData = null;
}
