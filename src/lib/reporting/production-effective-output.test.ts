import { describe, expect, it } from 'vitest';
import {
  netAlcoholOutputAfterPipelineLosses,
  type DeliveredBottlingOutputSummary,
  type PipelineAlcoholAdjustmentsSummary,
} from './production-effective-output';

const emptyPipeline: PipelineAlcoholAdjustmentsSummary = {
  distillationNetAlcoholGal: 0,
  distillationLossGal: 0,
  distillationGainGal: 0,
  blendAlcoholLossGal: 0,
  blendAlcoholGainGal: 0,
  bottlingAlcoholVarianceGal: 0,
  bottlingAlcoholLossGal: 0,
  bottlingAlcoholGainGal: 0,
  stillChargeSourceAlcoholVarianceGal: 0,
  stillChargeSourceAlcoholLossGal: 0,
  stillChargeSourceAlcoholGainGal: 0,
};

function delivered(laaGal: number, volumeGal = 25): DeliveredBottlingOutputSummary {
  return {
    bottledRunCount: 1,
    shippedVolumeGal: volumeGal,
    shippedVolumeLiters: volumeGal * 3.78541,
    shippedLaaGal: laaGal,
    shippedLaaLiters: laaGal * 3.78541,
  };
}

describe('netAlcoholOutputAfterPipelineLosses', () => {
  it('subtracts pipeline losses from hearts GPA', () => {
    const pipeline: PipelineAlcoholAdjustmentsSummary = {
      ...emptyPipeline,
      distillationNetAlcoholGal: 2,
      distillationLossGal: 2,
      blendAlcoholLossGal: 1,
      bottlingAlcoholLossGal: 0.5,
      bottlingAlcoholVarianceGal: -0.5,
    };
    expect(netAlcoholOutputAfterPipelineLosses(20, pipeline, delivered(10))).toBe(16.5);
  });

  it('adds pipeline gains back onto hearts GPA', () => {
    const pipeline: PipelineAlcoholAdjustmentsSummary = {
      ...emptyPipeline,
      distillationNetAlcoholGal: -1,
      distillationGainGal: 1,
      blendAlcoholGainGal: 0.5,
      bottlingAlcoholGainGal: 0.25,
      bottlingAlcoholVarianceGal: 0.25,
    };
    expect(netAlcoholOutputAfterPipelineLosses(10, pipeline, delivered(10))).toBe(11.75);
  });

  it('falls back to shipped LAA when no hearts are recorded', () => {
    const pipeline: PipelineAlcoholAdjustmentsSummary = {
      ...emptyPipeline,
      bottlingAlcoholLossGal: 1,
      bottlingAlcoholVarianceGal: -1,
    };
    expect(netAlcoholOutputAfterPipelineLosses(0, pipeline, delivered(8))).toBe(9);
  });
});