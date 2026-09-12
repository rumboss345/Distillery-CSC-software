import * as maintenance from '../maintenance-queries';

export const maintenanceRepository = {
  ...maintenance,
};

export type MaintenanceRepositoryType = typeof maintenanceRepository;
