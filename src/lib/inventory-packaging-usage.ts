/** Bottle or label consumption keyed by inventory item id (not SKU name). */
export function packagingCountsByItemId(
  lines: { itemId: number | null | undefined; count: number }[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const line of lines) {
    if (line.itemId == null || line.itemId <= 0 || line.count <= 0) continue;
    out.set(line.itemId, (out.get(line.itemId) ?? 0) + line.count);
  }
  return out;
}

/** Positive delta = return stock; negative = consume (same as name-based packaging adjustments). */
export function packagingInventoryAdjustmentsById(
  previous: Map<number, number>,
  next: Map<number, number>,
): Map<number, number> {
  const keys = new Set([...previous.keys(), ...next.keys()]);
  const adj = new Map<number, number>();
  for (const id of keys) {
    const delta = (previous.get(id) ?? 0) - (next.get(id) ?? 0);
    if (delta !== 0) adj.set(id, delta);
  }
  return adj;
}
