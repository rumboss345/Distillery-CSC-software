import * as quality from '../quality-queries';

export const qualityRepository = {
  ...quality,
};

export type QualityRepositoryType = typeof qualityRepository;
