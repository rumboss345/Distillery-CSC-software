/**
 * Phase 1P Permissions, Audit Log, Documents & Administration.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests } from '../../../src/db/database';
import {
  __injectActorForTests,
  __setPermissionEnforcementForTests,
  appendAuditLog,
  assertPermission,
  canPerformAction,
  createDocument,
  createErpUser,
  deactivateDocument,
  getAuditLogEntry,
  listAuditLog,
  listDocuments,
  listErpUsers,
  seedAdministrationIfEmpty,
  updateErpUserRole,
} from '../../../src/db/administration-queries';
import { roleHasPermission } from '../../../shared/admin/constants';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import {
  clearTestActor,
  createAdminAuditTestDb,
  seedRoleUsers,
  setTestActor,
} from '../helpers/admin-audit-test-helpers';

describe('Phase 1P Permissions, Audit & Documents', () => {
  let db: Database;

  afterEach(() => {
    clearTestActor();
    __injectActorForTests(null);
    __setPermissionEnforcementForTests(false);
    teardownTestDb();
  });

  it('seeds default administrator ERP user', async () => {
    db = await createAdminAuditTestDb();
    const users = listErpUsers();
    assert.equal(users.length, 1);
    assert.equal(users[0].role_code, 'ADMINISTRATOR');
    assert.equal(users[0].email, 'admin@test.local');
  });

  it('role permission matrix grants and denies expected actions', async () => {
    db = await createAdminAuditTestDb();
    assert.equal(roleHasPermission('ADMINISTRATOR', 'SHIP_FG'), true);
    assert.equal(roleHasPermission('WAREHOUSE', 'SHIP_FG'), true);
    assert.equal(roleHasPermission('SALES_READ_ONLY', 'SHIP_FG'), false);
    assert.equal(roleHasPermission('QUALITY', 'RELEASE_QA_HOLD'), true);
    assert.equal(roleHasPermission('PRODUCTION_OPERATOR', 'REVERSE_TRANSACTION'), false);
  });

  it('assertPermission denies warehouse user from managing users', async () => {
    db = await createAdminAuditTestDb();
    seedRoleUsers(db);
    setTestActor('warehouse@test.local', 'WAREHOUSE');
    assert.throws(
      () => assertPermission('MANAGE_USERS'),
      /Permission denied/i,
    );
    assert.doesNotThrow(() => assertPermission('SHIP_FG'));
  });

  it('requires reason for reverse transaction', async () => {
    db = await createAdminAuditTestDb();
    setTestActor('admin@test.local', 'ADMINISTRATOR');
    assert.throws(
      () => assertPermission('REVERSE_TRANSACTION'),
      /reason is required/i,
    );
    assert.doesNotThrow(() =>
      assertPermission('REVERSE_TRANSACTION', { reason: 'Posted in error' }),
    );
  });

  it('append-only audit log captures before/after and reason', async () => {
    db = await createAdminAuditTestDb();
    setTestActor('admin@test.local', 'ADMINISTRATOR');

    const id = appendAuditLog({
      action: 'REVERSE_TRANSACTION',
      entityType: 'liq_transaction',
      entityId: 42,
      beforeState: { status: 'Posted', volume: 100 },
      afterState: { status: 'Reversed' },
      reason: 'Operator error',
    });

    const entry = getAuditLogEntry(id)!;
    assert.equal(entry.action_code, 'REVERSE_TRANSACTION');
    assert.equal(entry.entity_type, 'liq_transaction');
    assert.equal(entry.entity_id, '42');
    assert.equal(entry.reason, 'Operator error');
    assert.equal(entry.actor_email, 'admin@test.local');
    assert.match(entry.before_state!, /"volume":100/);
    assert.match(entry.after_state!, /Reversed/);

    const rows = listAuditLog({ actionCode: 'REVERSE_TRANSACTION' });
    assert.equal(rows.length, 1);
  });

  it('document metadata stored without blob in operational tables', async () => {
    db = await createAdminAuditTestDb();
    setTestActor('admin@test.local', 'ADMINISTRATOR');

    const docId = createDocument({
      title: 'COA Batch 2026-01',
      documentType: 'COA',
      fileName: 'coa-2026-01.pdf',
      storageUri: 'file:///var/docs/coa-2026-01.pdf',
      entityType: 'fg_lot',
      entityId: 7,
      mimeType: 'application/pdf',
      fileSizeBytes: 128000,
      uploadedBy: 'admin@test.local',
    });

    const docs = listDocuments({ entityType: 'fg_lot', entityId: '7' });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].id, docId);
    assert.match(docs[0].document_code, /^DOC-\d{6}$/);
    assert.equal(docs[0].storage_uri, 'file:///var/docs/coa-2026-01.pdf');
    assert.equal(docs[0].file_size_bytes, 128000);

    deactivateDocument(docId);
    assert.equal(listDocuments({ entityType: 'fg_lot', entityId: '7' }).length, 0);
  });

  it('sales read-only cannot create documents', async () => {
    db = await createAdminAuditTestDb();
    seedRoleUsers(db);
    setTestActor('sales_read_only@test.local', 'SALES_READ_ONLY');
    assert.equal(canPerformAction('MANAGE_DOCUMENTS'), false);
    assert.throws(
      () =>
        createDocument({
          title: 'Blocked',
          documentType: 'Other',
          fileName: 'x.txt',
          storageUri: 'file:///tmp/x.txt',
        }),
      /Permission denied/i,
    );
  });

  it('updateErpUserRole changes role assignment', async () => {
    db = await createAdminAuditTestDb();
    const userId = createErpUser({
      email: 'operator@test.local',
      displayName: 'Line Operator',
      roleCode: 'PRODUCTION_OPERATOR',
    });
    updateErpUserRole(userId, 'PRODUCTION_MANAGER');
    const user = listErpUsers().find((u) => u.id === userId)!;
    assert.equal(user.role_code, 'PRODUCTION_MANAGER');
    setTestActor('operator@test.local', 'PRODUCTION_MANAGER');
    assert.doesNotThrow(() => assertPermission('REVERSE_TRANSACTION', { reason: 'Correction' }));
  });

  it('enforcement skipped when administration not seeded', async () => {
    db = await createAdminAuditTestDb();
    __injectDatabaseForTests(db);
    db.run('DELETE FROM adm_erp_users');
    __injectActorForTests(null);
    __setPermissionEnforcementForTests(true);
    assert.doesNotThrow(() => assertPermission('MANAGE_USERS'));
  });
});
