import * as costing from '../costing-queries';
import * as landedCost from '../landed-cost-queries';

export const CostingRepository = {
  ...costing,
  ...landedCost,
};

export type CostingRepositoryType = typeof CostingRepository;
