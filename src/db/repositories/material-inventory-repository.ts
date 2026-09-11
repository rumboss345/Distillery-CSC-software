import type { MaterialInventoryRepository } from '../../types/material-inventory';
import {
  createMaterialLot,
  getAvailableMaterialLots,
  getMaterialBalance,
  getMaterialBalanceByLocation,
  getMaterialLot,
  getMaterialLotBalance,
  getMaterialLotBalanceByLocation,
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
