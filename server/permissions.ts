/** Permission keys — must match src/lib/permissions.ts */
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

export const PROCESS_STAGE_KEYS = [
  'preparation',
  'fermentation',
  'distillation',
  'storage',
  'other',
] as const;

export type ProcessStageKey = (typeof PROCESS_STAGE_KEYS)[number];

export const DEFAULT_USER_PERMISSIONS: PermissionKey[] = [...PERMISSION_KEYS];

export function isValidPermission(key: string): key is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(key);
}

export function isValidProcessStage(key: string): key is ProcessStageKey {
  return (PROCESS_STAGE_KEYS as readonly string[]).includes(key);
}

export function sanitizePermissions(keys: string[]): PermissionKey[] {
  return keys.filter(isValidPermission);
}

export function sanitizeProcessStages(keys: string[]): ProcessStageKey[] {
  return keys.filter(isValidProcessStage);
}
