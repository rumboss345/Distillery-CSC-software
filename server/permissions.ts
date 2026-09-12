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

/** Assignable production actions (pages + process stages). */
export const ACTION_ASSIGNMENT_KEYS = [
  'wash',
  'recipes',
  'distillation',
  'blending',
  'barrels',
  'bottling',
  'inventory',
  'equipment',
  'preparation',
  'fermentation',
  'storage',
  'other',
] as const;

export type ActionAssignmentKey = (typeof ACTION_ASSIGNMENT_KEYS)[number];

/** @deprecated Use ACTION_ASSIGNMENT_KEYS process subset */
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

export function isValidActionAssignment(key: string): key is ActionAssignmentKey {
  return (ACTION_ASSIGNMENT_KEYS as readonly string[]).includes(key);
}

export function isValidProcessStage(key: string): key is ProcessStageKey {
  return (PROCESS_STAGE_KEYS as readonly string[]).includes(key);
}

export function sanitizePermissions(keys: string[]): PermissionKey[] {
  return keys.filter(isValidPermission);
}

export function sanitizeActionAssignments(keys: string[]): ActionAssignmentKey[] {
  return keys.filter(isValidActionAssignment);
}

export function sanitizeProcessStages(keys: string[]): ProcessStageKey[] {
  return keys.filter(isValidProcessStage);
}
