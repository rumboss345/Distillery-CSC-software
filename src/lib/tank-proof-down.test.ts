import { describe, expect, it } from 'vitest';
import { planTankProofDown } from './tank-proof-down';

describe('planTankProofDown', () => {
  it('brings a tank down to a target ABV and keeps the alcohol in that tank', () => {
    const plan = planTankProofDown({
      spiritGal: 100,
      spiritAbvPercent: 80,
      capacityGal: 500,
      tankName: 'Latina 500L',
      targetAbvPercent: 40,
    });

    expect(plan.ok).toBe(true);
    expect(plan.finishedGal).toBeGreaterThan(190);
    expect(plan.finishedGal).toBeLessThan(210);
    expect(plan.waterGal).toBeGreaterThan(plan.volumeAddedGal);
    expect(plan.contractionGal).toBeGreaterThan(0);
    expect(plan.finishedAbvPercent).toBeCloseTo(40, 0);
    expect(plan.spiritGal * plan.spiritAbvPercent).toBeCloseTo(
      plan.finishedGal * plan.finishedAbvPercent,
      0,
    );
  });

  it('adds a measured amount of water and lowers the proof', () => {
    const plan = planTankProofDown({
      spiritGal: 100,
      spiritAbvPercent: 80,
      capacityGal: 500,
      waterGal: 10,
    });

    expect(plan.ok).toBe(true);
    expect(plan.waterGal).toBeCloseTo(10, 1);
    expect(plan.finishedGal).toBeGreaterThan(100);
    expect(plan.finishedGal).toBeLessThan(110);
    expect(plan.finishedAbvPercent).toBeLessThan(80);
    expect(plan.volumeAddedGal).toBeLessThan(plan.waterGal);
  });

  it('refuses a target that is not lower, and a finish that does not fit', () => {
    expect(planTankProofDown({
      spiritGal: 100,
      spiritAbvPercent: 80,
      capacityGal: 500,
      targetAbvPercent: 80,
    }).message).toMatch(/lower than/);

    const overflow = planTankProofDown({
      spiritGal: 100,
      spiritAbvPercent: 80,
      capacityGal: 150,
      tankName: 'Small tank',
      targetAbvPercent: 40,
    });
    expect(overflow.ok).toBe(false);
    expect(overflow.message).toMatch(/Small tank holds 150.0 gal/);
  });

  it('refuses a tank with no alcohol', () => {
    expect(planTankProofDown({
      spiritGal: 0,
      spiritAbvPercent: 40,
      capacityGal: 100,
      targetAbvPercent: 20,
    }).message).toMatch(/no spirit/);
    expect(planTankProofDown({
      spiritGal: 40,
      spiritAbvPercent: 0,
      capacityGal: 100,
      waterGal: 5,
    }).message).toMatch(/no alcohol/);
  });
});
