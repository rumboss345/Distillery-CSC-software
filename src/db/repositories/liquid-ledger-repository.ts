import type {
  LiquidLedgerRepository,
  LiquidLotsRepository,
  TankRepository,
} from '../../types/liquid-ledger';
import * as lq from '../liquid-ledger-queries';

export const liquidLotsRepository: LiquidLotsRepository = {
  createLot: lq.createLot,
  getLot: lq.getLot,
  listLots: lq.listLots,
  getLotParents: lq.getLotParents,
  getLotChildren: lq.getLotChildren,
  getLotAncestry: lq.getLotAncestry,
  getLotBalance: lq.getLotBalance,
};

export const tankRepository: TankRepository = {
  listTanks: lq.listTanks,
  getTank: lq.getTank,
  saveTank: lq.saveTank,
  getTankBalance: lq.getTankBalance,
  getTankLotComponents: lq.getTankLotComponents,
  listLegacyFloorTanks: lq.listLegacyFloorTanks,
};

export const liquidLedgerRepository: LiquidLedgerRepository = {
  postTransaction: lq.postTransaction,
  reverseTransaction: lq.reverseTransaction,
  getTransactions: lq.getTransactions,
  receiveBulkSpirit: lq.receiveBulkSpirit,
  transferLiquid: lq.transferLiquid,
  createBlend: lq.createBlend,
  proofDown: lq.proofDown,
  postOpeningBalance: lq.postOpeningBalance,
  reconcileTank: lq.reconcileTank,
  postAdjustment: lq.postAdjustment,
};

export const liquidInventoryRepository = {
  lots: liquidLotsRepository,
  tanks: tankRepository,
  ledger: liquidLedgerRepository,
  lookups: {
    lotTypes: lq.listLotTypes,
    tankTypes: lq.listTankTypes,
  },
  previewReconciliation: lq.previewReconciliation,
  getReconciliations: lq.getReconciliations,
};
