import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import {
  normalizeSupplierClassifications,
  primarySupplierClassification,
} from '../../../shared/master-data/supplier-classifications';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function createDb() {
  const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(MASTER_DATA_SCHEMA);
  return db;
}

function insertSupplier(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>, code: string, type: string) {
  db.run(
    `INSERT INTO md_suppliers (supplier_code, company_name, supplier_type, active)
     VALUES (?, 'Test Co', ?, 1)`,
    [code, type],
  );
  return db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] as number;
}

function saveClassifications(
  db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>,
  supplierId: number,
  types: string[],
) {
  const classifications = normalizeSupplierClassifications(types);
  const primary = primarySupplierClassification(classifications);
  db.run('DELETE FROM md_supplier_classifications WHERE supplier_id = ?', [supplierId]);
  for (const supplierType of classifications) {
    db.run(
      'INSERT INTO md_supplier_classifications (supplier_id, supplier_type) VALUES (?, ?)',
      [supplierId, supplierType],
    );
  }
  db.run('UPDATE md_suppliers SET supplier_type = ? WHERE id = ?', [primary, supplierId]);
}

function readClassifications(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>, supplierId: number) {
  const rows = db.exec(
    `SELECT supplier_type FROM md_supplier_classifications WHERE supplier_id = ${supplierId} ORDER BY supplier_type COLLATE NOCASE`,
  );
  return (rows[0]?.values ?? []).map((row) => row[0] as string);
}

describe('supplier classification helpers', () => {
  it('normalizes and deduplicates classifications case-insensitively', () => {
    assert.deepEqual(
      normalizeSupplierClassifications(['Packaging', ' packaging ', 'Raw Materials']),
      ['Packaging', 'Raw Materials'],
    );
  });

  it('selects primary classification alphabetically', () => {
    assert.equal(primarySupplierClassification(['Services', 'Packaging']), 'Packaging');
  });
});

describe('supplier classifications (sql.js)', () => {
  it('saves a supplier with one classification', async () => {
    const db = await createDb();
    const id = insertSupplier(db, 'SUP-0001', 'Other');
    saveClassifications(db, id, ['Raw Materials']);
    assert.deepEqual(readClassifications(db, id), ['Raw Materials']);
    db.close();
  });

  it('saves a supplier with multiple classifications', async () => {
    const db = await createDb();
    const id = insertSupplier(db, 'SUP-0002', 'Other');
    saveClassifications(db, id, ['Raw Materials', 'Packaging', 'Bulk Spirit']);
    assert.deepEqual(readClassifications(db, id), ['Bulk Spirit', 'Packaging', 'Raw Materials']);
    db.close();
  });

  it('persists classifications after edit/reload simulation', async () => {
    const db = await createDb();
    const id = insertSupplier(db, 'SUP-0003', 'Other');
    saveClassifications(db, id, ['Equipment']);
    saveClassifications(db, id, ['Equipment', 'Services']);
    assert.deepEqual(readClassifications(db, id), ['Equipment', 'Services']);
    db.close();
  });

  it('rejects duplicate classification at database layer', async () => {
    const db = await createDb();
    const id = insertSupplier(db, 'SUP-0004', 'Other');
    db.run('INSERT INTO md_supplier_classifications (supplier_id, supplier_type) VALUES (?, ?)', [id, 'Packaging']);
    assert.throws(
      () => db.run('INSERT INTO md_supplier_classifications (supplier_id, supplier_type) VALUES (?, ?)', [id, 'Packaging']),
      /UNIQUE constraint failed/,
    );
    db.close();
  });

  it('migrates legacy single supplier_type into junction table', async () => {
    const db = await createDb();
    const id = insertSupplier(db, 'SUP-0005', 'Bulk Spirit');
    db.run(
      'INSERT OR IGNORE INTO md_supplier_classifications (supplier_id, supplier_type) VALUES (?, ?)',
      [id, 'Bulk Spirit'],
    );
    assert.deepEqual(readClassifications(db, id), ['Bulk Spirit']);
    const legacy = db.exec('SELECT supplier_type FROM md_suppliers WHERE id = ' + id)[0]?.values[0]?.[0];
    assert.equal(legacy, 'Bulk Spirit');
    db.close();
  });

  it('deactivate/reactivate retains supplier row and business code', async () => {
    const db = await createDb();
    const id = insertSupplier(db, 'SUP-0006', 'Services');
    saveClassifications(db, id, ['Services']);
    db.run('UPDATE md_suppliers SET active = 0 WHERE id = ?', [id]);
    const inactive = db.exec(`SELECT active, supplier_code FROM md_suppliers WHERE id = ${id}`)[0]?.values[0];
    assert.equal(inactive?.[0], 0);
    assert.equal(inactive?.[1], 'SUP-0006');
    db.run('UPDATE md_suppliers SET active = 1 WHERE id = ?', [id]);
    const count = db.exec('SELECT COUNT(*) FROM md_suppliers')[0]?.values[0]?.[0];
    assert.equal(count, 1);
    db.close();
  });

  it('deactivate/reactivate bulk spirit and location retain codes', async () => {
    const db = await createDb();
    db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active)
            VALUES ('BS-0001', 'NGS', 'Neutral Grain Spirit', 96, 1)`);
    db.run(`INSERT INTO md_storage_locations (location_code, name, location_type, active)
            VALUES ('LOC-0001', 'Warehouse A', 'Raw Material Warehouse', 1)`);
    db.run('UPDATE md_bulk_spirits SET active = 0 WHERE spirit_code = ?', ['BS-0001']);
    db.run('UPDATE md_storage_locations SET active = 0 WHERE location_code = ?', ['LOC-0001']);
    const bs = db.exec(`SELECT active, spirit_code FROM md_bulk_spirits WHERE spirit_code = 'BS-0001'`)[0]?.values[0];
    const loc = db.exec(`SELECT active, location_code FROM md_storage_locations WHERE location_code = 'LOC-0001'`)[0]?.values[0];
    assert.equal(bs?.[0], 0);
    assert.equal(bs?.[1], 'BS-0001');
    assert.equal(loc?.[0], 0);
    assert.equal(loc?.[1], 'LOC-0001');
    db.close();
  });
});
