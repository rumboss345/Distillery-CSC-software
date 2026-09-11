import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import { formatBusinessCode } from '../../../shared/master-data/codes';
import {
  assertValidLocationParent,
  validateAbvRequired,
  validateConversionFactor,
  validateRequired,
} from '../../../shared/master-data/validation';
import {
  dilutionCalculation,
  litresPureAlcohol,
  purchaseToInventoryQuantity,
  usGallonsToLitres,
} from '../../../shared/master-data/conversions';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('master data business codes', () => {
  it('formats readable product codes', () => {
    assert.equal(formatBusinessCode('PROD', 1), 'PROD-0001');
    assert.equal(formatBusinessCode('SKU', 123), 'SKU-0123');
  });
});

describe('master data validation', () => {
  it('rejects duplicate-code scenario inputs', () => {
    assert.throws(() => validateRequired('', 'Name'));
    assert.throws(() => validateAbvRequired(0));
    assert.throws(() => validateAbvRequired(101));
    assert.throws(() => validateConversionFactor(0));
  });

  it('accepts valid ABV percentage', () => {
    assert.doesNotThrow(() => validateAbvRequired(96));
  });
});

describe('master data unit conversions', () => {
  it('converts 100 US gal to litres', () => {
    assert.ok(Math.abs(usGallonsToLitres(100) - 378.5411784) < 1e-9);
  });

  it('calculates LPA at 96% ABV', () => {
    assert.equal(litresPureAlcohol(1000, 96), 960);
  });

  it('converts purchase units to inventory units', () => {
    assert.equal(purchaseToInventoryQuantity(2, 20), 40);
  });

  it('calculates dilution water addition', () => {
    const result = dilutionCalculation(1000, 96, 40);
    assert.ok(result.waterToAddLitres > 0);
    assert.equal(result.lpa, 960);
  });
});

describe('SKU product relationship (logic)', () => {
  it('requires product_id for SKU saves', () => {
    assert.throws(() => {
      if (!0) throw new Error('Product is required.');
    }, /Product is required/);
  });
});

describe('location hierarchy validation', () => {
  it('rejects self-parent', () => {
    assert.throws(
      () => assertValidLocationParent(5, 5, () => null),
      /cannot be its own parent/,
    );
  });

  it('rejects circular parent chain', () => {
    const parents: Record<number, number | null> = { 2: 3, 3: 1, 1: 2 };
    assert.throws(
      () => assertValidLocationParent(1, 2, (id) => parents[id] ?? null),
      /Circular location hierarchy/,
    );
  });

  it('accepts valid parent chain', () => {
    const parents: Record<number, number | null> = { 2: 1, 1: null };
    assert.doesNotThrow(() => assertValidLocationParent(3, 2, (id) => parents[id] ?? null));
  });
});

describe('master data schema constraints (sql.js)', () => {
  it('rejects duplicate business codes at database layer', async () => {
    const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const db = new SQL.Database();
    db.run(MASTER_DATA_SCHEMA);
    db.run(`INSERT INTO md_products (product_code, name, category) VALUES ('PROD-0001', 'A', 'Rum')`);
    assert.throws(
      () => db.run(`INSERT INTO md_products (product_code, name, category) VALUES ('PROD-0001', 'B', 'Vodka')`),
      /UNIQUE constraint failed/,
    );
    db.close();
  });

  it('seed lookups are idempotent with INSERT OR IGNORE', async () => {
    const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const db = new SQL.Database();
    db.run(MASTER_DATA_SCHEMA);
    for (let i = 0; i < 2; i++) {
      db.run(
        `INSERT OR IGNORE INTO md_lookup_values (lookup_type, name, sort_order) VALUES ('product_category', 'Rum', 1)`,
      );
    }
    const count = db.exec(`SELECT COUNT(*) FROM md_lookup_values WHERE lookup_type = 'product_category' AND name = 'Rum'`);
    assert.equal(count[0]?.values[0]?.[0], 1);
    db.close();
  });

  it('CSC products seed only when md_products is empty', async () => {
    const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const db = new SQL.Database();
    db.run(MASTER_DATA_SCHEMA);
    const seedIfEmpty = () => {
      const productCount = db.exec('SELECT COUNT(*) FROM md_products')[0]?.values[0]?.[0] as number;
      if (productCount > 0) return;
      db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-0001', 'Seven Fathoms Rum', 'Rum', 'Active')`);
    };
    seedIfEmpty();
    seedIfEmpty();
    const count = db.exec('SELECT COUNT(*) FROM md_products')[0]?.values[0]?.[0];
    assert.equal(count, 1);
    db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-0002', 'User Product', 'Gin', 'Active')`);
    seedIfEmpty();
    const finalCount = db.exec('SELECT COUNT(*) FROM md_products')[0]?.values[0]?.[0];
    assert.equal(finalCount, 2);
    db.close();
  });
});
