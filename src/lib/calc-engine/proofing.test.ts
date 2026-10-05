import { describe, expect, it } from 'vitest';
import { diluteWithWater } from './table6';
import {
  postProofing,
  previewProofing,
  PROOFING_ENGINE_VERSION,
  ALCOHOLOMETRY_STANDARD,
} from './proofing';

/**
 * Expected figures are the Table 6 mass balance, not the previous float engine.
 *
 * Printed Table 6 air specific gravities (27 CFR §30.66):
 * 80 proof 0.95172, 100 proof 0.93418, 120 proof 0.91333, 150 proof 0.87714,
 * 186 proof 0.82330, 190 proof 0.81582, 200 proof 0.79365.
 * 185.2 proof interpolates 185 (0.82509) and 186 (0.82330): 0.824732.
 * Water weight is 8.32823 lb per wine gallon, the factor in the §30.66 example.
 * A liter of water is 0.99794 kg, not 1 kg.
 *
 * Ethanol mass = volume × (ABV/100) × SG(200 proof) × 8.32823.
 * Finished mass = ethanol mass / mass fraction at the target proof.
 * Finished volume = finished mass / (SG(target) × 8.32823).
 * The 259.1 L case was calculated from those printed rows before the assertions below.
 */

describe('Table 6 proofing of 259.1 L at 92.6% ABV to 40.00%', () => {
  const result = previewProofing({
    kind: 'spirit-to-target',
    spiritQuantity: '259.1',
    spiritUnit: 'L',
    startingAbv: '92.6',
    targetAbv: '40.00',
    referenceTemperatureF: '60',
  });

  it('hits 40.00% ABV at 60 °F from the mass balance', () => {
    expect(result.ok).toBe(true);
    if (!result.ok || !('finalAbv' in result)) return;
    expect(result.finalAbv).toBe('40.00');
    expect(result.finalProof).toBe('80.00');
    expect(result.startingAbv).toBe('92.60');
    expect(result.startingProof).toBe('185.20');
    expect(result.referenceTemperatureF).toBe('60.0');
    expect(result.startingSpecificGravity).toBe('0.82473');
    expect(result.finishedSpecificGravity).toBe('0.95172');
    expect(result.finishedSpecificGravity).not.toBe('0.91746');
  });

  it('reports the audited masses, volumes, and contraction', () => {
    expect(result.ok).toBe(true);
    if (!('startingMassKg' in result)) return;
    expect(result.startingVolumeL).toBe('259.100');
    expect(result.startingVolumeGal).toBe('68.447');
    expect(result.startingMassLb).toBe('470.13');
    expect(result.startingMassKg).toBe('213.248');
    expect(result.ethanolMassLb).toBe('418.94');
    expect(result.ethanolMassKg).toBe('190.026');
    expect(result.spiritWaterMassKg).toBe('23.222');
    expect(result.waterMassLb).toBe('785.80');
    expect(result.waterMassKg).toBe('356.434');
    expect(result.waterVolumeL).toBe('357.169');
    expect(result.waterVolumeGal).toBe('94.354');
    expect(result.finishedMassLb).toBe('1255.94');
    expect(result.finishedMassKg).toBe('569.683');
    expect(result.finishedVolumeL).toBe('599.817');
    expect(result.finishedVolumeGal).toBe('158.455');
    expect(result.premixVolumeL).toBe('616.269');
    expect(result.contractionVolumeL).toBe('16.453');
    expect(result.contractionVolumeGal).toBe('4.346');
    expect(result.contractionPercent).toBe('2.67');
    expect(result.proofGallons).toBe('126.8');
    expect(result.waterPoundsPerGallon).toBe('8.32823');
    expect(result.startingDensityLbPerGal).toBe('6.86856');
    expect(result.finishedDensityLbPerGal).toBe('7.92614');
  });

  it('does not adopt the previous 357.8 L / 603.9 L / 570.57 kg figures', () => {
    expect(result.ok).toBe(true);
    if (!('waterVolumeL' in result)) return;
    expect(result.waterVolumeL).not.toBe('357.800');
    expect(result.finishedVolumeL).not.toBe('603.900');
    expect(result.finishedMassKg).not.toBe('570.570');
    expect(result.startingMassKg).not.toBe('213.530');
    const poured = Number(result.startingVolumeL) + Number(result.waterVolumeL);
    expect(Number(result.finishedVolumeL)).toBeLessThan(poured);
  });

  it('keeps posted pounds inside the rounding tolerance and stores decimal strings', () => {
    expect(result.ok).toBe(true);
    if (!('snapshot' in result) || !('startingMassLb' in result)) return;
    const start = Number(result.startingMassLb);
    const water = Number(result.waterMassLb);
    const finished = Number(result.finishedMassLb);
    expect(Math.abs(start + water - finished)).toBeLessThanOrEqual(0.02);
    const snapshot = JSON.parse(result.snapshot) as Record<string, string>;
    expect(snapshot.targetAbv).toBe('40.00');
    expect(snapshot.referenceTemperatureF).toBe('60.0');
    expect(snapshot.waterMassKg).toBe('356.434');
    expect(snapshot.finishedMassKg).toBe('569.683');
    expect(snapshot.finishedVolumeL).toBe('599.817');
    expect(snapshot.engineVersion).toBe(PROOFING_ENGINE_VERSION);
    expect(snapshot.alcoholometryStandard).toBe(ALCOHOLOMETRY_STANDARD);
    expect(snapshot.roundingPolicyVersion).toBe('rounding-1');
    expect(snapshot.validationStatus).toBe('passed');
    expect(typeof snapshot.waterMassKg).toBe('string');
  });

  it('does not treat a liter of water as a kilogram', () => {
    expect(result.ok).toBe(true);
    if (!('waterMassKg' in result)) return;
    expect(result.waterMassKg).not.toBe(result.waterVolumeL);
    expect(Number(result.waterMassKg) / Number(result.waterVolumeL)).toBeCloseTo(0.99794, 4);
  });
});

describe('Table 6 proofing vectors', () => {
  const cases = [
    { abv: '93', waterGal: '13.894', finishedGal: '23.250', waterLb: '115.72', finishedLb: '184.28' },
    { abv: '95', waterGal: '14.445', finishedGal: '23.750', waterLb: '120.30', finishedLb: '188.25' },
    { abv: '75', waterGal: '9.073', finishedGal: '18.750', waterLb: '75.56', finishedLb: '148.62' },
    { abv: '60', waterGal: '5.143', finishedGal: '15.000', waterLb: '42.83', finishedLb: '118.89' },
    { abv: '50', waterGal: '2.555', finishedGal: '12.500', waterLb: '21.28', finishedLb: '99.08' },
  ];

  it.each(cases)('$abv% to 40% for 10 gallons', ({ abv, waterGal, finishedGal, waterLb, finishedLb }) => {
    const result = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: abv,
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !('waterVolumeGal' in result)) return;
    expect(result.finalAbv).toBe('40.00');
    expect(result.waterVolumeGal).toBe(waterGal);
    expect(result.finishedVolumeGal).toBe(finishedGal);
    expect(result.waterMassLb).toBe(waterLb);
    expect(result.finishedMassLb).toBe(finishedLb);
    expect(Number(result.contractionVolumeGal)).toBeGreaterThan(0);
  });

  it('adds no water and no contraction when the spirit is already at the target', () => {
    const result = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '40',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !('waterVolumeGal' in result)) return;
    expect(result.waterVolumeGal).toBe('0.000');
    expect(result.waterMassLb).toBe('0.00');
    expect(result.finishedVolumeGal).toBe('10.000');
    expect(result.contractionVolumeGal).toBe('0.000');
    expect(result.contractionPercent).toBe('0.00');
    expect(result.finishedMassLb).toBe('79.26');
  });

  it('refuses a target above the starting ABV and posts nothing', () => {
    const request = {
      kind: 'spirit-to-target' as const,
      spiritQuantity: '10',
      spiritUnit: 'gal' as const,
      startingAbv: '40',
      targetAbv: '50',
      referenceTemperatureF: '60',
    };
    const preview = previewProofing(request);
    expect(preview.ok).toBe(false);
    expect(preview.warnings.join(' ')).toMatch(/cannot raise proof/i);
    const posted = postProofing(request);
    expect(posted.ok).toBe(false);
    expect('movements' in posted ? posted.movements : []).toEqual([]);
  });

  it('refuses 20 °C and 68 °F instead of silently using 60 °F', () => {
    const celsius = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureC: '20',
    });
    expect(celsius.ok).toBe(false);
    expect(celsius.warnings.join(' ')).toMatch(/OIML/);
    const fahrenheit = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '68',
    });
    expect(fahrenheit.ok).toBe(false);
    expect(fahrenheit.warnings.join(' ')).toMatch(/60 °F/);
    expect(fahrenheit.warnings.join(' ')).not.toMatch(/calculated/i);
  });

  it('proofs a very small batch and a large batch to the same strength', () => {
    const small = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '0.001',
      spiritUnit: 'L',
      startingAbv: '93',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(small.ok).toBe(true);
    if (small.ok && 'finishedVolumeL' in small) {
      expect(small.finalAbv).toBe('40.00');
      expect(small.finishedVolumeL).toBe('0.002');
      expect(small.contractionPercent).toBe('2.70');
    }
    const large = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '1000000',
      spiritUnit: 'L',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(large.ok).toBe(true);
    if (large.ok && 'finishedVolumeL' in large) {
      expect(large.finalAbv).toBe('40.00');
      expect(large.finishedVolumeL).toBe('2375000.000');
      expect(large.waterVolumeGal).toBe('381600.492');
      expect(large.contractionPercent).toBe('2.84');
    }
  });
});

describe('the same engine serves every proofing direction', () => {
  it('matches liters, gallons, pounds, and kilograms for 10 gal at 95%', () => {
    const gallons = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    const liters = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '37.8541178400',
      spiritUnit: 'L',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    const pounds = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '67.9433659860',
      spiritUnit: 'lb',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    const kilograms = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '30.8185924034',
      spiritUnit: 'kg',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    for (const result of [gallons, liters, pounds, kilograms]) {
      expect(result.ok).toBe(true);
      if (!result.ok || !('waterMassLb' in result)) return;
      expect(result.waterVolumeGal).toBe('14.445');
      expect(result.waterMassLb).toBe('120.30');
      expect(result.finishedVolumeGal).toBe('23.750');
      expect(result.finalAbv).toBe('40.00');
    }
  });

  it('reads the resulting ABV from a known water addition', () => {
    const result = previewProofing({
      kind: 'spirit-plus-water',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '95',
      waterQuantity: '14.445150',
      waterUnit: 'gal',
      referenceTemperatureF: '60',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !('finalAbv' in result)) return;
    expect(result.finalAbv).toBe('40.00');
    expect(result.finishedVolumeGal).toBe('23.750');
  });

  it('splits a finished volume into spirit and water', () => {
    const result = previewProofing({
      kind: 'finished-volume',
      finishedQuantity: '23.750',
      finishedUnit: 'gal',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !('startingVolumeGal' in result)) return;
    expect(result.startingVolumeGal).toBe('10.000');
    expect(result.waterVolumeGal).toBe('14.445');
    expect(result.finalAbv).toBe('40.00');
  });

  it('splits a finished mass into spirit and water', () => {
    const result = previewProofing({
      kind: 'finished-mass',
      finishedQuantity: '188.245897570500',
      finishedUnit: 'lb',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !('waterMassLb' in result)) return;
    expect(result.finalAbv).toBe('40.00');
    expect(result.startingVolumeGal).toBe('10.000');
  });

  it('turns a finished mass and specific gravity into volume and ABV', () => {
    const result = previewProofing({
      kind: 'mass-and-gravity',
      finishedMass: '79.261430556',
      massUnit: 'lb',
      specificGravity: '0.95172',
      referenceTemperatureF: '60',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !('finalAbv' in result)) return;
    expect(result.finalAbv).toBe('40.00');
    expect(result.finalProof).toBe('80.00');
    expect(result.finishedVolumeGal).toBe('10.000');
    expect(result.finishedSpecificGravity).toBe('0.95172');
  });

  it('blocks posting when the added water misses the target', () => {
    const posted = postProofing({
      kind: 'spirit-plus-water',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '95',
      waterQuantity: '1',
      waterUnit: 'gal',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(posted.ok).toBe(false);
    if (!('movements' in posted)) return;
    expect(posted.movements).toEqual([]);
    expect(posted.checks.find((check) => check.name === 'target-proof')?.passed).toBe(false);
  });

  it('returns ledger movements only after the checks pass, without writing a database', () => {
    const posted = postProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    }, { sourceLot: 'LOT-1', batchId: 'B-1', trackProofingWater: true });
    expect(posted.ok).toBe(true);
    if (!posted.ok || !('movements' in posted)) return;
    expect(posted.movements.map((movement) => movement.item)).toEqual([
      'high-proof-spirit',
      'proofing-water',
      'finished-spirit',
    ]);
    expect(posted.movements[0].sourceLot).toBe('LOT-1');
    const snapshot = JSON.parse(posted.snapshot) as Record<string, string>;
    expect(snapshot.engineVersion).toBe(PROOFING_ENGINE_VERSION);
    expect(snapshot.ledgerMovements).toContain('proofing-water');
  });

  it('keeps the Table 6 parts method as a cross-check, not as the mass answer', () => {
    const parts = diluteWithWater('10', '190', '80');
    expect(parts.ok).toBe(true);
    if (!parts.ok) return;
    expect(parts.waterWineGallons).toBe('14.444');
    const mass = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: '10',
      spiritUnit: 'gal',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(mass.ok).toBe(true);
    if (!mass.ok || !('waterVolumeGal' in mass)) return;
    expect(mass.waterVolumeGal).toBe('14.445');
    expect(mass.finalAbv).toBe('40.00');
  });

  it('rejects a binary float passed in place of a decimal string', () => {
    const result = previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: 10 as unknown as string,
      spiritUnit: 'gal',
      startingAbv: '95',
      targetAbv: '40',
      referenceTemperatureF: '60',
    });
    expect(result.ok).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/decimal/i);
  });
});
