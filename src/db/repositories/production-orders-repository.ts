import type { ProductionOrdersRepository } from '../../types/production-orders';
import * as po from '../production-orders-queries';

export const productionOrdersRepository: ProductionOrdersRepository = {
  listOrders: po.listOrders,
  getOrder: po.getOrder,
  createOrder: po.createOrder,
  updateDraftOrder: po.updateDraftOrder,
  planOrder: po.planOrder,
  releaseOrder: po.releaseOrder,
  cancelOrder: po.cancelOrder,
  completeOrder: po.completeOrder,
  getRequirements: po.getRequirements,
  getBatches: po.getBatches,
  createBatch: po.createBatch,
  getBatch: po.getBatch,
  startBatch: po.startBatch,
  recordInput: po.recordInput,
  recordLoss: po.recordLoss,
  completeBatch: po.completeBatch,
  cancelBatch: po.cancelBatch,
  getPlannedVsActual: po.getPlannedVsActual,
  getBatchLedgerTransactions: po.getBatchLedgerTransactions,
  getBatchSteps: po.getBatchSteps,
  updateBatchStepStatus: po.updateBatchStepStatus,
  getEvents: po.getEvents,
  getProductionProgress: po.getProductionProgress,
  lookups: { productionTypes: po.getProductionTypes },
};
