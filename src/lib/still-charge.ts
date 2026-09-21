/** True when charge volume exceeds the still's rated capacity. */
export function chargeExceedsStillCapacity(
  chargeGal: number,
  stillCapacityGal: number | null | undefined,
): boolean {
  if (!(chargeGal > 0)) return false;
  if (stillCapacityGal == null || stillCapacityGal <= 0) return false;
  return chargeGal > stillCapacityGal + 0.0001;
}

export function stillChargeCapacityMessage(
  chargeGal: number,
  stillName: string,
  stillCapacityGal: number,
): string {
  return `Charge volume (${chargeGal} gal) exceeds ${stillName} capacity (${stillCapacityGal} gal).`;
}

export function stillAlreadyOccupiedMessage(
  stillName: string,
  batchNumber: string,
  status: string,
  chargeGal: number,
): string {
  const volNote = chargeGal > 0 ? ` with ${chargeGal.toFixed(1)} gal charged` : '';
  return `${stillName} is already in use by run ${batchNumber} (${status})${volNote}. Complete that run or choose another still before charging again.`;
}
