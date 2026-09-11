import {
  codePrefixForEntity,
  formatBusinessCode,
  type CodeEntityType,
} from '../../shared/master-data/codes';
import {
  DEFAULT_LOCATION_TYPES,
  DEFAULT_MATERIAL_TYPES,
  DEFAULT_PACKAGE_TYPES,
  DEFAULT_PACKAGING_TYPES,
  DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_SPIRIT_TYPES,
  DEFAULT_SUPPLIER_TYPES,
  DEFAULT_UNITS,
  LOOKUP_TYPES,
} from '../../shared/master-data/constants';
import {
  assertValidLocationParent,
  validateAbvOptional,
  validateAbvRequired,
  validateConversionFactor,
  validatePositive,
  validateRequired,
} from '../../shared/master-data/validation';
import type {
  MdBulkSpirit,
  MdLookupValue,
  MdPackagingMaterial,
  MdProduct,
  MdRawMaterial,
  MdSku,
  MdStorageLocation,
  MdSupplier,
  MdUnit,
} from '../types/master-data';
import { insertRow, queryAll, queryOne, runQuery } from './database';

const now = () => new Date().toISOString();

function assertUniqueCode(table: string, codeColumn: string, code: string, excludeId?: number) {
  const existing = queryOne<{ id: number }>(
    `SELECT id FROM ${table} WHERE ${codeColumn} = ? COLLATE NOCASE${excludeId != null ? ' AND id != ?' : ''}`,
    excludeId != null ? [code, excludeId] : [code],
  );
  if (existing) throw new Error(`Code "${code}" already exists.`);
}

export function nextBusinessCode(entityType: CodeEntityType, table: string, codeColumn: string): string {
  const prefix = codePrefixForEntity(entityType);
  const seqType = entityType;
  const row = queryOne<{ last_number: number }>(
    'SELECT last_number FROM md_code_sequences WHERE entity_type = ?',
    [seqType],
  );
  let next = (row?.last_number ?? 0) + 1;
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = formatBusinessCode(prefix, next);
    const clash = queryOne<{ id: number }>(
      `SELECT id FROM ${table} WHERE ${codeColumn} = ?`,
      [code],
    );
    if (!clash) {
      if (row) {
        runQuery('UPDATE md_code_sequences SET last_number = ? WHERE entity_type = ?', [next, seqType]);
      } else {
        insertRow('INSERT INTO md_code_sequences (entity_type, last_number) VALUES (?, ?)', [seqType, next]);
      }
      return code;
    }
    next++;
  }
  throw new Error('Could not generate a unique business code.');
}

// ─── Lookups & Units ───────────────────────────────────────────────────────

export function getLookupValues(lookupType: string, activeOnly = true): MdLookupValue[] {
  return queryAll<MdLookupValue>(
    `SELECT * FROM md_lookup_values WHERE lookup_type = ?${activeOnly ? ' AND active = 1' : ''}
     ORDER BY sort_order, name COLLATE NOCASE`,
    [lookupType],
  );
}

export function getLookupNames(lookupType: string): string[] {
  return getLookupValues(lookupType).map((v) => v.name);
}

export function addLookupValue(lookupType: string, name: string): MdLookupValue {
  validateRequired(name, 'Name');
  const trimmed = name.trim();
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM md_lookup_values WHERE lookup_type = ? AND name = ? COLLATE NOCASE',
    [lookupType, trimmed],
  );
  if (existing) throw new Error(`"${trimmed}" already exists.`);
  const id = insertRow(
    'INSERT INTO md_lookup_values (lookup_type, name, sort_order) VALUES (?, ?, ?)',
    [lookupType, trimmed, 999],
  );
  return queryOne<MdLookupValue>('SELECT * FROM md_lookup_values WHERE id = ?', [id])!;
}

export function getUnits(activeOnly = true): MdUnit[] {
  return queryAll<MdUnit>(
    `SELECT * FROM md_units${activeOnly ? ' WHERE active = 1' : ''} ORDER BY unit_type, code`,
  );
}

export function getUnitCodes(unitType?: string): string[] {
  const units = unitType
    ? queryAll<MdUnit>('SELECT code FROM md_units WHERE active = 1 AND unit_type = ? ORDER BY code', [unitType])
    : getUnits();
  return units.map((u) => u.code);
}

// ─── Suppliers ─────────────────────────────────────────────────────────────

export function getSuppliers(activeOnly = false): MdSupplier[] {
  return queryAll<MdSupplier>(
    `SELECT * FROM md_suppliers${activeOnly ? ' WHERE active = 1' : ''} ORDER BY company_name COLLATE NOCASE`,
  );
}

export function saveSupplier(data: Omit<MdSupplier, 'id' | 'supplier_code' | 'created_at' | 'updated_at'>, id?: number, code?: string) {
  validateRequired(data.company_name, 'Company name');
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('md_suppliers', 'supplier_code', code, id);
    runQuery(
      `UPDATE md_suppliers SET company_name=?, contact_name=?, email=?, phone=?, country=?, address=?,
       website=?, supplier_type=?, payment_terms=?, currency=?, active=?, notes=?, updated_at=?,
       supplier_code=COALESCE(?, supplier_code) WHERE id=?`,
      [data.company_name, data.contact_name, data.email, data.phone, data.country, data.address,
        data.website, data.supplier_type, data.payment_terms, data.currency, data.active, data.notes, ts,
        code ?? null, id],
    );
    return id;
  }
  const supplierCode = code ?? nextBusinessCode('supplier', 'md_suppliers', 'supplier_code');
  assertUniqueCode('md_suppliers', 'supplier_code', supplierCode);
  return insertRow(
    `INSERT INTO md_suppliers (supplier_code, company_name, contact_name, email, phone, country, address,
      website, supplier_type, payment_terms, currency, active, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [supplierCode, data.company_name, data.contact_name, data.email, data.phone, data.country, data.address,
      data.website, data.supplier_type, data.payment_terms, data.currency, data.active, data.notes, ts, ts],
  );
}

export function setSupplierActive(id: number, active: boolean) {
  runQuery('UPDATE md_suppliers SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now(), id]);
}

// ─── Products ──────────────────────────────────────────────────────────────

export function getProducts(statusFilter?: string): MdProduct[] {
  if (statusFilter && statusFilter !== 'all') {
    return queryAll<MdProduct>(
      'SELECT * FROM md_products WHERE status = ? ORDER BY name COLLATE NOCASE',
      [statusFilter],
    );
  }
  return queryAll<MdProduct>('SELECT * FROM md_products ORDER BY name COLLATE NOCASE');
}

export function getActiveProducts(): MdProduct[] {
  return queryAll<MdProduct>(
    "SELECT * FROM md_products WHERE status = 'Active' ORDER BY name COLLATE NOCASE",
  );
}

export function saveProduct(
  data: Omit<MdProduct, 'id' | 'product_code' | 'created_at' | 'updated_at'>,
  id?: number,
  code?: string,
) {
  validateRequired(data.name, 'Product name');
  validateRequired(data.category, 'Category');
  validateAbvOptional(data.default_abv);
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('md_products', 'product_code', code, id);
    runQuery(
      `UPDATE md_products SET name=?, brand=?, category=?, description=?, default_abv=?, status=?, notes=?,
       updated_at=?, product_code=COALESCE(?, product_code) WHERE id=?`,
      [data.name, data.brand, data.category, data.description, data.default_abv, data.status, data.notes, ts,
        code ?? null, id],
    );
    return id;
  }
  const productCode = code ?? nextBusinessCode('product', 'md_products', 'product_code');
  assertUniqueCode('md_products', 'product_code', productCode);
  return insertRow(
    `INSERT INTO md_products (product_code, name, brand, category, description, default_abv, status, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [productCode, data.name, data.brand, data.category, data.description, data.default_abv, data.status, data.notes, ts, ts],
  );
}

// ─── SKUs ──────────────────────────────────────────────────────────────────

export function getSkus(productId?: number): MdSku[] {
  if (productId) {
    return queryAll<MdSku>(
      `SELECT s.*, p.name AS product_name FROM md_skus s
       JOIN md_products p ON p.id = s.product_id WHERE s.product_id = ? ORDER BY s.name COLLATE NOCASE`,
      [productId],
    );
  }
  return queryAll<MdSku>(
    `SELECT s.*, p.name AS product_name FROM md_skus s
     JOIN md_products p ON p.id = s.product_id ORDER BY p.name, s.name COLLATE NOCASE`,
  );
}

export function saveSku(
  data: Omit<MdSku, 'id' | 'sku_code' | 'created_at' | 'updated_at' | 'product_name'>,
  id?: number,
  code?: string,
) {
  validateRequired(data.name, 'SKU name');
  if (!data.product_id) throw new Error('Product is required.');
  validatePositive(data.package_size, 'Package size');
  validatePositive(data.containers_per_case, 'Containers per case');
  validateAbvOptional(data.target_abv);
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('md_skus', 'sku_code', code, id);
    runQuery(
      `UPDATE md_skus SET product_id=?, name=?, package_type=?, package_size=?, package_size_unit=?,
       containers_per_case=?, cases_per_pallet=?, target_abv=?, barcode_upc=?, case_barcode=?, status=?, notes=?,
       updated_at=?, sku_code=COALESCE(?, sku_code) WHERE id=?`,
      [data.product_id, data.name, data.package_type, data.package_size, data.package_size_unit,
        data.containers_per_case, data.cases_per_pallet, data.target_abv, data.barcode_upc, data.case_barcode,
        data.status, data.notes, ts, code ?? null, id],
    );
    return id;
  }
  const skuCode = code ?? nextBusinessCode('sku', 'md_skus', 'sku_code');
  assertUniqueCode('md_skus', 'sku_code', skuCode);
  return insertRow(
    `INSERT INTO md_skus (sku_code, product_id, name, package_type, package_size, package_size_unit,
      containers_per_case, cases_per_pallet, target_abv, barcode_upc, case_barcode, status, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [skuCode, data.product_id, data.name, data.package_type, data.package_size, data.package_size_unit,
      data.containers_per_case, data.cases_per_pallet, data.target_abv, data.barcode_upc, data.case_barcode,
      data.status, data.notes, ts, ts],
  );
}

export function setSkuStatus(id: number, status: string) {
  runQuery('UPDATE md_skus SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
}

// ─── Raw Materials ─────────────────────────────────────────────────────────

export function getRawMaterials(activeOnly = false): MdRawMaterial[] {
  return queryAll<MdRawMaterial>(
    `SELECT m.*, s.company_name AS supplier_name FROM md_raw_materials m
     LEFT JOIN md_suppliers s ON s.id = m.preferred_supplier_id
     ${activeOnly ? 'WHERE m.active = 1' : ''}
     ORDER BY m.name COLLATE NOCASE`,
  );
}

export function saveRawMaterial(
  data: Omit<MdRawMaterial, 'id' | 'material_code' | 'created_at' | 'updated_at' | 'supplier_name'>,
  id?: number,
  code?: string,
) {
  validateRequired(data.name, 'Material name');
  validateRequired(data.inventory_unit, 'Inventory unit');
  validateRequired(data.purchase_unit, 'Purchase unit');
  validateConversionFactor(data.conversion_factor);
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('md_raw_materials', 'material_code', code, id);
    runQuery(
      `UPDATE md_raw_materials SET name=?, material_type=?, inventory_unit=?, purchase_unit=?, conversion_factor=?,
       preferred_supplier_id=?, reorder_level=?, reorder_quantity=?, standard_cost=?, last_cost=?, purchase_currency=?,
       active=?, lot_tracked=?, expiration_tracked=?, notes=?, updated_at=?, material_code=COALESCE(?, material_code) WHERE id=?`,
      [data.name, data.material_type, data.inventory_unit, data.purchase_unit, data.conversion_factor,
        data.preferred_supplier_id, data.reorder_level, data.reorder_quantity, data.standard_cost, data.last_cost,
        data.purchase_currency, data.active, data.lot_tracked, data.expiration_tracked, data.notes, ts, code ?? null, id],
    );
    return id;
  }
  const materialCode = code ?? nextBusinessCode('rawMaterial', 'md_raw_materials', 'material_code');
  assertUniqueCode('md_raw_materials', 'material_code', materialCode);
  return insertRow(
    `INSERT INTO md_raw_materials (material_code, name, material_type, inventory_unit, purchase_unit, conversion_factor,
      preferred_supplier_id, reorder_level, reorder_quantity, standard_cost, last_cost, purchase_currency,
      active, lot_tracked, expiration_tracked, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [materialCode, data.name, data.material_type, data.inventory_unit, data.purchase_unit, data.conversion_factor,
      data.preferred_supplier_id, data.reorder_level, data.reorder_quantity, data.standard_cost, data.last_cost,
      data.purchase_currency, data.active, data.lot_tracked, data.expiration_tracked, data.notes, ts, ts],
  );
}

export function setRawMaterialActive(id: number, active: boolean) {
  runQuery('UPDATE md_raw_materials SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now(), id]);
}

// ─── Packaging Materials ───────────────────────────────────────────────────

export function getPackagingMaterials(activeOnly = false): MdPackagingMaterial[] {
  return queryAll<MdPackagingMaterial>(
    `SELECT m.*, s.company_name AS supplier_name FROM md_packaging_materials m
     LEFT JOIN md_suppliers s ON s.id = m.preferred_supplier_id
     ${activeOnly ? 'WHERE m.active = 1' : ''}
     ORDER BY m.name COLLATE NOCASE`,
  );
}

export function savePackagingMaterial(
  data: Omit<MdPackagingMaterial, 'id' | 'packaging_code' | 'created_at' | 'updated_at' | 'supplier_name'>,
  id?: number,
  code?: string,
) {
  validateRequired(data.name, 'Packaging name');
  validateRequired(data.inventory_unit, 'Inventory unit');
  validateRequired(data.purchase_unit, 'Purchase unit');
  validateConversionFactor(data.units_per_purchase_unit);
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('md_packaging_materials', 'packaging_code', code, id);
    runQuery(
      `UPDATE md_packaging_materials SET name=?, packaging_type=?, size_description=?, inventory_unit=?, purchase_unit=?,
       units_per_purchase_unit=?, preferred_supplier_id=?, reorder_level=?, reorder_quantity=?, standard_cost=?, last_cost=?,
       purchase_currency=?, active=?, lot_tracked=?, notes=?, updated_at=?, packaging_code=COALESCE(?, packaging_code) WHERE id=?`,
      [data.name, data.packaging_type, data.size_description, data.inventory_unit, data.purchase_unit,
        data.units_per_purchase_unit, data.preferred_supplier_id, data.reorder_level, data.reorder_quantity,
        data.standard_cost, data.last_cost, data.purchase_currency, data.active, data.lot_tracked, data.notes, ts,
        code ?? null, id],
    );
    return id;
  }
  const packagingCode = code ?? nextBusinessCode('packaging', 'md_packaging_materials', 'packaging_code');
  assertUniqueCode('md_packaging_materials', 'packaging_code', packagingCode);
  return insertRow(
    `INSERT INTO md_packaging_materials (packaging_code, name, packaging_type, size_description, inventory_unit,
      purchase_unit, units_per_purchase_unit, preferred_supplier_id, reorder_level, reorder_quantity, standard_cost,
      last_cost, purchase_currency, active, lot_tracked, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [packagingCode, data.name, data.packaging_type, data.size_description, data.inventory_unit, data.purchase_unit,
      data.units_per_purchase_unit, data.preferred_supplier_id, data.reorder_level, data.reorder_quantity,
      data.standard_cost, data.last_cost, data.purchase_currency, data.active, data.lot_tracked, data.notes, ts, ts],
  );
}

export function setPackagingMaterialActive(id: number, active: boolean) {
  runQuery('UPDATE md_packaging_materials SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now(), id]);
}

// ─── Bulk Spirits ──────────────────────────────────────────────────────────

export function getBulkSpirits(activeOnly = false): MdBulkSpirit[] {
  return queryAll<MdBulkSpirit>(
    `SELECT b.*, s.company_name AS supplier_name FROM md_bulk_spirits b
     LEFT JOIN md_suppliers s ON s.id = b.producer_supplier_id
     ${activeOnly ? 'WHERE b.active = 1' : ''}
     ORDER BY b.name COLLATE NOCASE`,
  );
}

export function saveBulkSpirit(
  data: Omit<MdBulkSpirit, 'id' | 'spirit_code' | 'created_at' | 'updated_at' | 'supplier_name'>,
  id?: number,
  code?: string,
) {
  validateRequired(data.name, 'Bulk spirit name');
  validateAbvRequired(data.nominal_abv, 'Nominal ABV');
  validatePositive(data.litres_per_purchase_unit, 'Litres per purchase unit');
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('md_bulk_spirits', 'spirit_code', code, id);
    runQuery(
      `UPDATE md_bulk_spirits SET name=?, spirit_type=?, origin_country=?, producer_supplier_id=?, nominal_abv=?,
       inventory_unit=?, purchase_unit=?, litres_per_purchase_unit=?, standard_cost=?, last_cost=?, purchase_currency=?,
       lot_tracked=?, excise_category=?, active=?, notes=?, updated_at=?, spirit_code=COALESCE(?, spirit_code) WHERE id=?`,
      [data.name, data.spirit_type, data.origin_country, data.producer_supplier_id, data.nominal_abv,
        data.inventory_unit, data.purchase_unit, data.litres_per_purchase_unit, data.standard_cost, data.last_cost,
        data.purchase_currency, data.lot_tracked, data.excise_category, data.active, data.notes, ts, code ?? null, id],
    );
    return id;
  }
  const spiritCode = code ?? nextBusinessCode('bulkSpirit', 'md_bulk_spirits', 'spirit_code');
  assertUniqueCode('md_bulk_spirits', 'spirit_code', spiritCode);
  return insertRow(
    `INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, origin_country, producer_supplier_id, nominal_abv,
      inventory_unit, purchase_unit, litres_per_purchase_unit, standard_cost, last_cost, purchase_currency,
      lot_tracked, excise_category, active, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [spiritCode, data.name, data.spirit_type, data.origin_country, data.producer_supplier_id, data.nominal_abv,
      data.inventory_unit, data.purchase_unit, data.litres_per_purchase_unit, data.standard_cost, data.last_cost,
      data.purchase_currency, data.lot_tracked, data.excise_category, data.active, data.notes, ts, ts],
  );
}

export function setBulkSpiritActive(id: number, active: boolean) {
  runQuery('UPDATE md_bulk_spirits SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now(), id]);
}

// ─── Storage Locations ─────────────────────────────────────────────────────

export function getStorageLocations(activeOnly = false): MdStorageLocation[] {
  return queryAll<MdStorageLocation>(
    `SELECT l.*, p.name AS parent_name FROM md_storage_locations l
     LEFT JOIN md_storage_locations p ON p.id = l.parent_location_id
     ${activeOnly ? 'WHERE l.active = 1' : ''}
     ORDER BY l.name COLLATE NOCASE`,
  );
}

function getLocationParentId(locationId: number): number | null {
  return queryOne<{ parent_location_id: number | null }>(
    'SELECT parent_location_id FROM md_storage_locations WHERE id = ?',
    [locationId],
  )?.parent_location_id ?? null;
}

export function saveStorageLocation(
  data: Omit<MdStorageLocation, 'id' | 'location_code' | 'created_at' | 'updated_at' | 'parent_name'>,
  id?: number,
  code?: string,
) {
  validateRequired(data.name, 'Location name');
  assertValidLocationParent(id, data.parent_location_id, getLocationParentId);
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('md_storage_locations', 'location_code', code, id);
    runQuery(
      `UPDATE md_storage_locations SET name=?, location_type=?, description=?, active=?, parent_location_id=?,
       updated_at=?, location_code=COALESCE(?, location_code) WHERE id=?`,
      [data.name, data.location_type, data.description, data.active, data.parent_location_id, ts, code ?? null, id],
    );
    return id;
  }
  const locationCode = code ?? nextBusinessCode('location', 'md_storage_locations', 'location_code');
  assertUniqueCode('md_storage_locations', 'location_code', locationCode);
  return insertRow(
    `INSERT INTO md_storage_locations (location_code, name, location_type, description, active, parent_location_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [locationCode, data.name, data.location_type, data.description, data.active, data.parent_location_id, ts, ts],
  );
}

export function setStorageLocationActive(id: number, active: boolean) {
  runQuery('UPDATE md_storage_locations SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now(), id]);
}

// ─── Seed & Migration bootstrap ──────────────────────────────────────────────

function seedLookups(lookupType: string, names: string[]) {
  names.forEach((name, i) => {
    runQuery(
      'INSERT OR IGNORE INTO md_lookup_values (lookup_type, name, sort_order) VALUES (?, ?, ?)',
      [lookupType, name, i + 1],
    );
  });
}

function seedUnits() {
  for (const u of DEFAULT_UNITS) {
    runQuery(
      'INSERT OR IGNORE INTO md_units (code, name, unit_type) VALUES (?, ?, ?)',
      [u.code, u.name, u.unit_type],
    );
  }
  runQuery(
    `INSERT OR IGNORE INTO md_unit_conversions (from_unit_code, to_unit_code, factor, notes) VALUES
      ('US_gal', 'L', 3.785411784, 'US liquid gallon to litres'),
      ('L', 'US_gal', ?, 'Litres to US gallon'),
      ('mL', 'L', 0.001, 'Millilitres to litres'),
      ('L', 'mL', 1000, 'Litres to millilitres')`,
    [1 / 3.785411784],
  );
}

export function seedMasterDataIfEmpty(): void {
  seedLookups(LOOKUP_TYPES.PRODUCT_CATEGORY, DEFAULT_PRODUCT_CATEGORIES);
  seedLookups(LOOKUP_TYPES.MATERIAL_TYPE, DEFAULT_MATERIAL_TYPES);
  seedLookups(LOOKUP_TYPES.PACKAGING_TYPE, DEFAULT_PACKAGING_TYPES);
  seedLookups(LOOKUP_TYPES.SPIRIT_TYPE, DEFAULT_SPIRIT_TYPES);
  seedLookups(LOOKUP_TYPES.SUPPLIER_TYPE, DEFAULT_SUPPLIER_TYPES);
  seedLookups(LOOKUP_TYPES.LOCATION_TYPE, DEFAULT_LOCATION_TYPES);
  seedLookups(LOOKUP_TYPES.PACKAGE_TYPE, DEFAULT_PACKAGE_TYPES);
  seedUnits();

  const productCount = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM md_products')?.count ?? 0;
  if (productCount > 0) return;

  const ts = now();
  const products = [
    { name: 'Seven Fathoms Rum', brand: 'Seven Fathoms', category: 'Rum', default_abv: 40 },
    { name: "Bobo's Vodka", brand: "Bobo's", category: 'Vodka', default_abv: 40 },
    { name: "Governor's Reserve Rum", brand: 'Governor\'s Reserve', category: 'Rum', default_abv: 40 },
    { name: 'Offshore Gin', brand: 'Offshore', category: 'Gin', default_abv: 40 },
  ];

  for (const p of products) {
    const code = nextBusinessCode('product', 'md_products', 'product_code');
    insertRow(
      `INSERT INTO md_products (product_code, name, brand, category, description, default_abv, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [code, p.name, p.brand, p.category, '', p.default_abv, 'Active', 'CSC default product', ts, ts],
    );
  }
}
