/** Phase 1P — ERP roles, actions, and role-permission matrix (browser-local). */

export const ERP_ROLES = [
  'ADMINISTRATOR',
  'MANAGEMENT',
  'PRODUCTION_MANAGER',
  'PRODUCTION_OPERATOR',
  'WAREHOUSE',
  'PURCHASING',
  'QUALITY',
  'MAINTENANCE',
  'SALES_READ_ONLY',
] as const;

export type ErpRoleCode = (typeof ERP_ROLES)[number];

export const ERP_ROLE_LABELS: Record<ErpRoleCode, string> = {
  ADMINISTRATOR: 'Administrator',
  MANAGEMENT: 'Management',
  PRODUCTION_MANAGER: 'Production Manager',
  PRODUCTION_OPERATOR: 'Production Operator',
  WAREHOUSE: 'Warehouse',
  PURCHASING: 'Purchasing',
  QUALITY: 'Quality',
  MAINTENANCE: 'Maintenance',
  SALES_READ_ONLY: 'Sales / Read Only',
};

export const ERP_ACTIONS = [
  'REVERSE_TRANSACTION',
  'COMPLETE_BATCH',
  'SHIP_FG',
  'RELEASE_QA_HOLD',
  'PLACE_QA_HOLD',
  'POST_RETURN',
  'REVERSE_BARREL_FILL',
  'ADJUST_COST',
  'MANAGE_USERS',
  'VIEW_AUDIT_LOG',
  'MANAGE_DOCUMENTS',
  'VIEW_DOCUMENTS',
] as const;

export type ErpActionCode = (typeof ERP_ACTIONS)[number];

export const ERP_ACTION_LABELS: Record<ErpActionCode, string> = {
  REVERSE_TRANSACTION: 'Reverse transaction',
  COMPLETE_BATCH: 'Complete production batch',
  SHIP_FG: 'Ship finished goods',
  RELEASE_QA_HOLD: 'Release QA hold',
  PLACE_QA_HOLD: 'Place QA hold',
  POST_RETURN: 'Post sales return',
  REVERSE_BARREL_FILL: 'Reverse barrel fill',
  ADJUST_COST: 'Adjust cost',
  MANAGE_USERS: 'Manage users & roles',
  VIEW_AUDIT_LOG: 'View audit log',
  MANAGE_DOCUMENTS: 'Manage documents',
  VIEW_DOCUMENTS: 'View documents',
};

/** Sensitive actions that require a non-empty reason before execution. */
export const REASON_REQUIRED_ACTIONS: ReadonlySet<ErpActionCode> = new Set([
  'REVERSE_TRANSACTION',
  'RELEASE_QA_HOLD',
  'REVERSE_BARREL_FILL',
  'ADJUST_COST',
]);

/** Role → permitted actions. Administrator implicitly receives all actions. */
export const ROLE_PERMISSIONS: Record<ErpRoleCode, readonly ErpActionCode[]> = {
  ADMINISTRATOR: [...ERP_ACTIONS],
  MANAGEMENT: [
    'REVERSE_TRANSACTION',
    'COMPLETE_BATCH',
    'SHIP_FG',
    'RELEASE_QA_HOLD',
    'PLACE_QA_HOLD',
    'POST_RETURN',
    'REVERSE_BARREL_FILL',
    'ADJUST_COST',
    'VIEW_AUDIT_LOG',
    'VIEW_DOCUMENTS',
    'MANAGE_DOCUMENTS',
  ],
  PRODUCTION_MANAGER: [
    'COMPLETE_BATCH',
    'REVERSE_TRANSACTION',
    'VIEW_AUDIT_LOG',
    'VIEW_DOCUMENTS',
  ],
  PRODUCTION_OPERATOR: ['COMPLETE_BATCH', 'VIEW_DOCUMENTS'],
  WAREHOUSE: ['SHIP_FG', 'POST_RETURN', 'VIEW_DOCUMENTS', 'VIEW_AUDIT_LOG'],
  PURCHASING: ['VIEW_DOCUMENTS', 'VIEW_AUDIT_LOG'],
  QUALITY: ['RELEASE_QA_HOLD', 'PLACE_QA_HOLD', 'VIEW_AUDIT_LOG', 'VIEW_DOCUMENTS'],
  MAINTENANCE: ['VIEW_DOCUMENTS'],
  SALES_READ_ONLY: ['VIEW_DOCUMENTS'],
};

export function roleHasPermission(role: ErpRoleCode, action: ErpActionCode): boolean {
  if (role === 'ADMINISTRATOR') return true;
  return ROLE_PERMISSIONS[role].includes(action);
}

export function actionRequiresReason(action: ErpActionCode): boolean {
  return REASON_REQUIRED_ACTIONS.has(action);
}
