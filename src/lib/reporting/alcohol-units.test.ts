import { describe, expect, it } from 'vitest';
import {
  laaGalFromVolumeAbv,
  roundAlcohol,
  roundVolume,
  safePercent,
  volumeGalFromLaaGal,
} from './alcohol-units';

describe('alcohol-units', () => {
  it('computes LAA from volume and ABV', () => {
    expect(laaGalFromVolumeAbv(100, 50)).toBe(50);
    expect(laaGalFromVolumeAbv(0, 50)).toBe(0);
    expect(laaGalFromVolumeAbv(10, 0)).toBe(0);
  });

  it('rounds alcohol and volume', () => {
    expect(roundAlcohol(1.23456789)).toBe(1.2346);
    expect(roundVolume(1.23456)).toBe(1.235);
  });

  it('inverts LAA to volume', () => {
    expect(volumeGalFromLaaGal(50, 50)).toBe(100);
  });

  it('safePercent avoids divide by zero', () => {
    expect(safePercent(5, 100)).toBe(5);
    expect(safePercent(5, 0)).toBeNull();
  });
});
