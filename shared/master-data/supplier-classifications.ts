/** Normalize supplier classification labels (authoritative many-to-many source). */
export function normalizeSupplierClassifications(types: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of types) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized.sort((a, b) => a.localeCompare(b));
}

/** Primary type cached on md_suppliers.supplier_type for legacy/PG single-column queries. */
export function primarySupplierClassification(types: string[]): string {
  const normalized = normalizeSupplierClassifications(types);
  return normalized[0] ?? 'Other';
}
