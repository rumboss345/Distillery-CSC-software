import * as fg from '../finished-goods-queries';

export const finishedGoodsRepository = {
  ...fg,
};

export type FinishedGoodsRepositoryType = typeof finishedGoodsRepository;
