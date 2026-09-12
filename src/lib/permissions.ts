export const PERMISSION_KEYS = [
  'dashboard',
  'wash',
  'distillation',
  'blending',
  'barrels',
  'bottling',
  'equipment',
  'inventory',
  'reports',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  dashboard: 'Dashboard',
  wash: 'Wash & Fermentation',
  distillation: 'Distillation',
  blending: 'Blending',
  barrels: 'Barrel Aging',
  bottling: 'Bottling',
  equipment: 'Equipment / Floor Plan',
  inventory: 'Inventory',
  reports: 'Reports',
};

export const ROUTE_PERMISSIONS: Record<string, PermissionKey> = {
  '/': 'dashboard',
  '/wash': 'wash',
  '/mash': 'wash',
  '/recipes': 'wash',
  '/distillation': 'distillation',
  '/blending': 'blending',
  '/barrels': 'barrels',
  '/bottling': 'bottling',
  '/floor-plan': 'equipment',
  '/inventory': 'inventory',
  '/reports': 'reports',
};

export const PROCESS_STAGE_KEYS = [
  'preparation',
  'fermentation',
  'distillation',
  'storage',
  'other',
] as const;

export type ProcessStageKey = (typeof PROCESS_STAGE_KEYS)[number];

export const PROCESS_STAGE_LABELS: Record<ProcessStageKey, string> = {
  preparation: 'Mash / Cook',
  fermentation: 'Fermenter',
  distillation: 'Distillation',
  storage: 'Holding Tanks',
  other: 'Other Equipment',
};

export function userHasPermission(
  role: 'admin' | 'user',
  permissions: string[] | undefined,
  key: PermissionKey,
): boolean {
  if (role === 'admin') return true;
  return permissions?.includes(key) ?? false;
}

export function permissionForPath(pathname: string): PermissionKey | null {
  if (pathname === '/' || pathname === '') return 'dashboard';
  const base = pathname.split('/').filter(Boolean)[0];
  if (!base) return 'dashboard';
  const full = `/${base}`;
  return ROUTE_PERMISSIONS[full] ?? null;
}
