import { describe, expect, it } from 'vitest';
import { planSpiritChargeForFinishedVolume, planSpiritChargeProof, spiritChargeDetail } from './spirit-charge-proof';

describe('planSpiritChargeProof', () => {
  it('waters high-proof tails down and keeps the proofed charge inside the still', () => {
    const plan = planSpiritChargeProof({
      spiritGal: 100,
      spiritAbvPercent: 80,
      targetAbvPercent: 40,
      stillCapacityGal: 250,
      sourceTankFreeGal: 0,
      place: 'in_still',
      stillName: 'Vendome',
    });

    expect(plan.ok).toBe(true);
    expect(plan.stillGal).toBeCloseTo(200, 0);
    expect(plan.waterGal).toBeGreaterThan(90);
    expect(plan.waterGal).toBeLessThan(120);
    expect(plan.stillGal).toBeLessThanOrEqual(250);
    expect(plan.message).toMatch(/in the still/);
  });

  it('refuses a proofed charge that would overflow the still and names the max tails', () => {
    const plan = planSpiritChargeProof({
      spiritGal: 100,
      spiritAbvPercent: 80,
      targetAbvPercent: 40,
      stillCapacityGal: 150,
      sourceTankFreeGal: 500,
      place: 'in_still',
      stillName: 'Vendome',
    });

    expect(plan.ok).toBe(false);
    expect(plan.stillGal).toBeGreaterThan(150);
    expect(plan.maxSpiritGal).toBeCloseTo(75, 0);
    expect(plan.message).toMatch(/Vendome holds 150/);
    expect(plan.message).toMatch(/75\.0 gal of tails/);
  });

  it('refuses blending before the still when the tails tank has no room for the water', () => {
    const blocked = planSpiritChargeProof({
      spiritGal: 80,
      spiritAbvPercent: 70,
      targetAbvPercent: 40,
      stillCapacityGal: 1200,
      sourceTankFreeGal: 5,
      place: 'before_still',
      tankName: 'Tails tank',
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toMatch(/Tails tank only has 5.0 gal free/);
    expect(blocked.message).toMatch(/blend the water in the still/i);

    const inStill = planSpiritChargeProof({
      spiritGal: 80,
      spiritAbvPercent: 70,
      targetAbvPercent: 40,
      stillCapacityGal: 1200,
      sourceTankFreeGal: 5,
      place: 'in_still',
    });
    expect(inStill.ok).toBe(true);
  });

  it('requires a lower target proof', () => {
    const plan = planSpiritChargeProof({
      spiritGal: 50,
      spiritAbvPercent: 40,
      targetAbvPercent: 45,
      stillCapacityGal: 200,
      sourceTankFreeGal: 100,
      place: 'in_still',
    });
    expect(plan.ok).toBe(false);
    expect(plan.message).toMatch(/lower than the tails/);
  });
});

describe('planSpiritChargeForFinishedVolume', () => {
  it('names the spirit and water that fill a still volume at the proof it needs', () => {
    const plan = planSpiritChargeForFinishedVolume({
      finishedGal: 200,
      spiritAbvPercent: 80,
      targetAbvPercent: 40,
      stillCapacityGal: 250,
      sourceTankFreeGal: 0,
      availableSpiritGal: 150,
      place: 'in_still',
      stillName: 'Vendome',
    });

    expect(plan.ok).toBe(true);
    expect(plan.spiritGal).toBeGreaterThan(90);
    expect(plan.spiritGal).toBeLessThan(110);
    expect(plan.waterGal).toBeGreaterThan(90);
    expect(plan.stillGal).toBeGreaterThan(195);
    expect(plan.stillGal).toBeLessThanOrEqual(205);
    expect(plan.message).toMatch(/Pull .+ gal of spirit at 80\.0% ABV/);
    expect(plan.message).toMatch(/add .+ gal of water in the still/);
    expect(plan.message).toMatch(/40\.0% ABV/);
  });

  it('refuses a final volume larger than the still', () => {
    const plan = planSpiritChargeForFinishedVolume({
      finishedGal: 200,
      spiritAbvPercent: 80,
      targetAbvPercent: 40,
      stillCapacityGal: 150,
      sourceTankFreeGal: 500,
      availableSpiritGal: 200,
      place: 'in_still',
      stillName: 'Vendome',
    });
    expect(plan.ok).toBe(false);
    expect(plan.message).toMatch(/Vendome holds 150\.0 gal/);
  });

  it('refuses a pull larger than the spirit on hand', () => {
    const plan = planSpiritChargeForFinishedVolume({
      finishedGal: 200,
      spiritAbvPercent: 80,
      targetAbvPercent: 40,
      stillCapacityGal: 400,
      sourceTankFreeGal: 500,
      availableSpiritGal: 40,
      place: 'in_still',
      tankName: 'High wines',
    });
    expect(plan.ok).toBe(false);
    expect(plan.message).toMatch(/High wines has 40\.0 gal/);
    expect(plan.message).toMatch(/needs/);
  });

  it('refuses blending the water in a tank that has no room', () => {
    const plan = planSpiritChargeForFinishedVolume({
      finishedGal: 100,
      spiritAbvPercent: 70,
      targetAbvPercent: 40,
      stillCapacityGal: 1200,
      sourceTankFreeGal: 2,
      availableSpiritGal: 200,
      place: 'before_still',
      tankName: 'Tails tank',
    });
    expect(plan.ok).toBe(false);
    expect(plan.message).toMatch(/Tails tank only has 2\.0 gal free/);
    expect(plan.message).toMatch(/Blend the water in the still/);
  });
});

describe('spiritChargeDetail', () => {
  it('describes tails and proofing water on a saved charge', () => {
    expect(spiritChargeDetail({
      charge_volume_gal: 140,
      charge_abv: 40,
      proof_water_gal: 62,
      proof_spirit_gal: 80,
      proof_spirit_abv: 70,
      proof_place: 'before_still',
    })).toBe('80.0 gal tails @ 70.0% + 62.0 gal water, blended before the still');
  });
});
