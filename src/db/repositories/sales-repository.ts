import * as sales from '../sales-queries';

export const salesRepository = {
  ...sales,
};

export type SalesRepositoryType = typeof salesRepository;
