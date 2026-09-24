import { describe, expect, it } from 'vitest';
import {
  classifyProcessLiquid,
  processEquipmentShortName,
  processLiquidPalette,
} from './process-floor-label';

describe('processEquipmentShortName', () => {
  it('shortens storage tank names without dropping the identity', () => {
    expect(processEquipmentShortName('Low wines storage Tank 5')).toBe('Low wine 5');
    expect(processEquipmentShortName('Storage for High proof cane Spirits 1')).toBe('HP cane 1');
    expect(processEquipmentShortName('Gin Storage milk can 1')).toBe('Gin 1');
    expect(processEquipmentShortName('Fermentation 3')).toBe('Ferm 3');
    expect(processEquipmentShortName('Vendome')).toBe('Vendome');
  });
});

describe('classifyProcessLiquid', () => {
  it('prefers the contents line over a generic tank name', () => {
    expect(classifyProcessLiquid('Latina 500L', 'Hearts from D-12')).toBe('high_proof');
    expect(classifyProcessLiquid('Storage tank of tails runs')).toBe('tails');
    expect(classifyProcessLiquid('Dunder tank')).toBe('dunder');
  });
});

describe('processLiquidPalette', () => {
  it('returns no fill color for an empty vessel', () => {
    expect(processLiquidPalette('Low wines storage Tank 5', null, 0)).toBeUndefined();
    expect(processLiquidPalette('Low wines storage Tank 5', 'Low wines', 40)?.base).toBeTruthy();
  });
});
