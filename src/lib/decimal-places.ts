/** Cut typed digits past `places` decimals. Blank and partial entries such as "12." stay as typed. */
export function limitDecimalPlaces(raw: string, places = 2): string {
  const match = /^(-?\d*)\.(\d*)$/.exec(raw.trim());
  if (!match || match[2].length <= places) return raw;
  return `${match[1]}.${match[2].slice(0, places)}`;
}

/** A number for an input box, rounded to at most `places` decimals. Zero or missing is blank. */
export function inputValueUpToDecimals(value: number | null | undefined, places = 2): string {
  if (value == null || !Number.isFinite(value) || value === 0) return '';
  return String(Number(value.toFixed(places)));
}
