/** Highest alcohol content a person can enter. */
export const MAX_ENTERED_ABV = 99;

export function abvLimitMessage(label = 'Alcohol content'): string {
  return `${label} cannot be over ${MAX_ENTERED_ABV}%.`;
}

export function abvExceedsLimit(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value > MAX_ENTERED_ABV;
}

export function assertEnteredAbv(value: number | null | undefined, label = 'Alcohol content'): void {
  if (abvExceedsLimit(value)) {
    throw new Error(abvLimitMessage(label));
  }
}

/** Keep a typed ABV. Blank stays blank. Anything above 99% becomes 99. */
export function limitAbvInput(raw: string): string {
  if (raw.trim() === '') return raw;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return raw;
  if (parsed > MAX_ENTERED_ABV) return String(MAX_ENTERED_ABV);
  return raw;
}

export function limitAbvNumber(value: number): number {
  if (!Number.isFinite(value) || value <= MAX_ENTERED_ABV) return value;
  return MAX_ENTERED_ABV;
}
