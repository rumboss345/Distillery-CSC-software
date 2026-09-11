import type { MaterialInventoryRepository } from '../../types/material-inventory';
import {
  activateMaterialLedgerTracking,
  createMaterialLot,
  getAvailableMaterialLots,
  getMaterialBalance,
  getMaterialBalanceByLocation,
  getMaterialLedgerInfo,
  getMaterialLot,
  getMaterialLotBalance,
  getMaterialLotBalanceByLocation,
  getMaterialTrackingMode,
  getMaterialTransactions,
  getMaterialUomConversions,
  listMaterialLots,
  normalizeMaterialQuantity,
  postMaterialOpeningBalance,
  postMaterialReconciliation,
  postMaterialTransaction,
  previewMaterialReconciliation,
  reverseMaterialTransaction,
  saveMaterialUomConversion,
  transferMaterial,
} from '../material-inventory-queries';

export const materialInventoryRepository: MaterialInventoryRepository = {
  tracking: {
    getMode: getMaterialTrackingMode,
    getLedgerInfo: getMaterialLedgerInfo,
    activateLedger: activateMaterialLedgerTracking,
  },
  lots: {
    create: createMaterialLot,
    get: getMaterialLot,
    list: listMaterialLots,
    getAvailableLots: getAvailableMaterialLots,
  },
  balance: {
    getMaterialBalance,
    getMaterialBalanceByLocation,
    getLotBalance: getMaterialLotBalance,
    getLotBalanceByLocation: getMaterialLotBalanceByLocation,
  },
  ledger: {
    postTransaction: postMaterialTransaction,
    reverseTransaction: reverseMaterialTransaction,
    transferMaterial,
    postOpeningBalance: postMaterialOpeningBalance,
    getTransactions: getMaterialTransactions,
  },
  uom: {
    saveConversion: saveMaterialUomConversion,
    getConversions: getMaterialUomConversions,
    normalizeQuantity: normalizeMaterialQuantity,
  },
  reconcile: {
    preview: previewMaterialReconciliation,
    post: postMaterialReconciliation,
  },
};
