import * as accounting from '../accounting-queries';

export const accountingRepository = {
  ...accounting,
};

export type AccountingRepositoryType = typeof accountingRepository;
