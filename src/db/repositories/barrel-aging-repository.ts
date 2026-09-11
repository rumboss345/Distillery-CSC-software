import * as barrelAging from '../barrel-aging-queries';

export const barrelAgingRepository = {
  ...barrelAging,
};

export type BarrelAgingRepositoryType = typeof barrelAgingRepository;
