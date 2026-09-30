export const UNASSIGNED_WAREHOUSE_LOCATION = 'Unassigned';

export function normalizeWarehouseLocationName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function warehouseLocationNameError(name: string): string | null {
  if (!normalizeWarehouseLocationName(name)) return 'Enter a warehouse location name.';
  return null;
}

export interface WarehouseLocationGroup<T> {
  name: string;
  locationId: number | null;
  barrels: T[];
}

type LocatedBarrel = {
  warehouse_location: string;
  fill_date: string;
  barrel_number: string;
};

/** Oldest fill date first. Same day falls back to barrel number. */
export function compareBarrelsOldestFirst<T extends Pick<LocatedBarrel, 'fill_date' | 'barrel_number'>>(
  a: T,
  b: T,
): number {
  const date = a.fill_date.localeCompare(b.fill_date);
  if (date !== 0) return date;
  return a.barrel_number.localeCompare(b.barrel_number, undefined, { numeric: true, sensitivity: 'base' });
}

/** Catalog locations stay visible when empty. Barrels match a location by name, ignoring case. */
export function groupBarrelsByLocation<T extends LocatedBarrel>(
  barrels: T[],
  locations: { id: number; name: string }[],
): WarehouseLocationGroup<T>[] {
  const byKey = new Map<string, WarehouseLocationGroup<T>>();
  const catalog = [...locations].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const location of catalog) {
    const name = normalizeWarehouseLocationName(location.name);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (byKey.has(key)) continue;
    byKey.set(key, { name, locationId: location.id, barrels: [] });
  }

  const orphans: WarehouseLocationGroup<T>[] = [];
  const unassigned: T[] = [];
  for (const barrel of barrels) {
    const name = normalizeWarehouseLocationName(barrel.warehouse_location);
    if (!name) {
      unassigned.push(barrel);
      continue;
    }
    const key = name.toLocaleLowerCase();
    const group = byKey.get(key);
    if (group) {
      group.barrels.push(barrel);
      continue;
    }
    let orphan = orphans.find((item) => item.name.toLocaleLowerCase() === key);
    if (!orphan) {
      orphan = { name, locationId: null, barrels: [] };
      orphans.push(orphan);
    }
    orphan.barrels.push(barrel);
  }

  orphans.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const groups = [...byKey.values(), ...orphans];
  if (unassigned.length > 0) {
    groups.push({
      name: UNASSIGNED_WAREHOUSE_LOCATION,
      locationId: null,
      barrels: unassigned,
    });
  }
  for (const group of groups) {
    group.barrels.sort(compareBarrelsOldestFirst);
  }
  return groups;
}
