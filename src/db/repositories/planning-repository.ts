import * as planning from '../planning-queries';

export const planningRepository = {
  ...planning,
};

export type PlanningRepositoryType = typeof planningRepository;
