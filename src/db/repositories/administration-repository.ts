import * as admin from '../administration-queries';

export const administrationRepository = {
  ...admin,
};

export type AdministrationRepositoryType = typeof administrationRepository;
