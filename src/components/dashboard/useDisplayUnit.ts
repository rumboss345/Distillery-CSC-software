import { useState } from 'react';
import { isDisplayVolumeUnit, type DisplayVolumeUnit } from '../../lib/reporting/alcohol-units';

const STORAGE_KEY = 'dashboard-volume-unit';

function readStored(): DisplayVolumeUnit {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isDisplayVolumeUnit(stored) ? stored : 'us_gal';
  } catch {
    return 'us_gal';
  }
}

/** Display unit for dashboard volumes, remembered on this device. Records stay in US gallons. */
export function useDisplayUnit(): [DisplayVolumeUnit, (unit: DisplayVolumeUnit) => void] {
  const [unit, setUnit] = useState<DisplayVolumeUnit>(readStored);
  const update = (next: DisplayVolumeUnit) => {
    setUnit(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Remembering the unit is optional.
    }
  };
  return [unit, update];
}
