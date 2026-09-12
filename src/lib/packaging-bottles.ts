export interface PackagingBottle {
  name: string;
  sizeMl: number;
}

/** Standard packaging bottle SKUs for bottling and inventory. */
export const PACKAGING_BOTTLES: PackagingBottle[] = [
  { name: '1L Hutchings', sizeMl: 1000 },
  { name: '1L Governors', sizeMl: 1000 },
  { name: '1L Bobos', sizeMl: 1000 },
  { name: '750mL 7F', sizeMl: 750 },
  { name: '750mL Pirate', sizeMl: 750 },
  { name: '750mL Gin', sizeMl: 750 },
  { name: '750mL Muse', sizeMl: 750 },
  { name: '375mL Oslo', sizeMl: 375 },
  { name: '200mL Flask', sizeMl: 200 },
  { name: '50mL Airplane', sizeMl: 50 },
];

export function packagingBottleByName(name: string): PackagingBottle | undefined {
  return PACKAGING_BOTTLES.find((b) => b.name.toLowerCase() === name.toLowerCase());
}
