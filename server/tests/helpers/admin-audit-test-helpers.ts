import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests } from '../../../src/db/database';
import { ADMINISTRATION_SCHEMA } from '../../../src/db/administration-schema';
import {
  __injectActorForTests,
  __setPermissionEnforcementForTests,
  createErpUser,
  seedAdministrationIfEmpty,
} from '../../../src/db/administration-queries';
import type { ErpRoleCode } from '../../../shared/admin/constants';
import { createCostingTestDb } from './costing-test-helpers';

export async function createAdminAuditTestDb(): Promise<Database> {
  const db = await createCostingTestDb(true);
  db.run(ADMINISTRATION_SCHEMA);
  __injectDatabaseForTests(db);
  seedAdministrationIfEmpty('admin@test.local');
  __setPermissionEnforcementForTests(true);
  return db;
}

export function seedRoleUsers(db: Database): Record<string, { email: string; role: ErpRoleCode }> {
  __injectDatabaseForTests(db);
  const roles: ErpRoleCode[] = [
    'MANAGEMENT',
    'PRODUCTION_MANAGER',
    'PRODUCTION_OPERATOR',
    'WAREHOUSE',
    'PURCHASING',
    'QUALITY',
    'MAINTENANCE',
    'SALES_READ_ONLY',
  ];
  const users: Record<string, { email: string; role: ErpRoleCode }> = {};
  for (const role of roles) {
    const email = `${role.toLowerCase()}@test.local`;
    try {
      createErpUser({ email, displayName: role, roleCode: role });
    } catch {
      // already exists from prior seed
    }
    users[role] = { email, role };
  }
  return users;
}

export function setTestActor(email: string, role: ErpRoleCode): void {
  __injectActorForTests({ userId: null, email, role });
}

export function clearTestActor(): void {
  __injectActorForTests(null);
}
