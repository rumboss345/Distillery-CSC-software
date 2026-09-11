/** UI-only quantity display — does not alter stored values. */
export function formatCostQuantity(quantity: number, unit: string): string {
  const u = unit.toLowerCase();
  if (['each', 'case', 'pallet', 'bottle', 'can'].includes(u)) {
    return `${Math.round(quantity)} ${unit.toUpperCase()}`;
  }
  return `${quantity.toFixed(3)} ${unit}`;
}

export function formatDashboardValue(
  valueKyd: number | null,
  valuationStatus: string,
  label: string,
): string {
  if (valuationStatus === 'UNVALUED' || valueKyd == null) return `${label}: Unvalued`;
  if (valuationStatus === 'PARTIALLY_VALUED') {
    return `${label}: KYD ${valueKyd.toFixed(2)} (Partial)`;
  }
  return `${label}: KYD ${valueKyd.toFixed(2)}`;
}
