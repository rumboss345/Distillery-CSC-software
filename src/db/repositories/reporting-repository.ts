import * as reporting from '../reporting-queries';

export const reportingRepository = {
  ...reporting,
};

export type ReportingRepositoryType = typeof reportingRepository;
