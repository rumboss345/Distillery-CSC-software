import * as md from '../master-data-queries';

/** Browser-local master data repository (Phase 1B). Server implementation deferred to Step 1A+. */
export const masterDataRepository = {
  products: {
    list: md.getProducts,
    listActive: md.getActiveProducts,
    save: md.saveProduct,
  },
  skus: {
    list: md.getSkus,
    save: md.saveSku,
    setStatus: md.setSkuStatus,
  },
  rawMaterials: {
    list: md.getRawMaterials,
    save: md.saveRawMaterial,
    setActive: md.setRawMaterialActive,
  },
  packagingMaterials: {
    list: md.getPackagingMaterials,
    save: md.savePackagingMaterial,
    setActive: md.setPackagingMaterialActive,
  },
  bulkSpirits: {
    list: md.getBulkSpirits,
    save: md.saveBulkSpirit,
    setActive: md.setBulkSpiritActive,
  },
  suppliers: {
    list: md.getSuppliers,
    save: md.saveSupplier,
    setActive: md.setSupplierActive,
  },
  locations: {
    list: md.getStorageLocations,
    save: md.saveStorageLocation,
    setActive: md.setStorageLocationActive,
  },
  lookups: {
    get: md.getLookupNames,
    add: md.addLookupValue,
  },
  units: {
    list: md.getUnits,
    codes: md.getUnitCodes,
  },
};
