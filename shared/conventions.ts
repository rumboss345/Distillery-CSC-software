/**
 * CSC Distillery ERP — data conventions (Step 1A-0 foundation).
 *
 * LIQUID VOLUME
 * - Canonical storage unit: litres (L)
 * - US gallon conversion: 1 US gal = 3.785411784 L (exact, used once on import)
 * - Historical browser fields named *_gal are US liquid gallons (CSC app was US-gallon based)
 * - Do not round-trip L → gal → L when persisting; store litres only after import
 *
 * ABV
 * - Stored as percentage 0–100 (e.g. 40 = 40% ABV, NOT 0.40)
 * - LPA (litres pure alcohol) = volume_litres × (abv / 100)
 *
 * NUMERIC / MONEY (future costing)
 * - PostgreSQL NUMERIC for costs, prices, duty, tax rates, production volumes
 * - inventory_items.quantity: NUMERIC(14,4)
 * - Future currency amounts: NUMERIC(18,6) recommended
 * - Never use JavaScript float as authoritative money
 *
 * TIME
 * - Server stores TIMESTAMPTZ in UTC
 * - UI displays in user local timezone
 *
 * IDENTIFIERS (new ERP entities from Step 1A onward)
 * - Primary keys: BIGINT GENERATED ALWAYS AS IDENTITY (recommended over UUID for PG ERP)
 * - Business document numbers are separate human-readable fields (PO-2026-000123, TX-2026-001542)
 * - Do not expose internal IDs as operational document numbers
 */

export const ABV_MIN = 0;
export const ABV_MAX = 100;

export function assertAbvPercent(abv: number, context = 'ABV'): void {
  if (!Number.isFinite(abv) || abv < ABV_MIN || abv > ABV_MAX) {
    throw new Error(`${context} must be between ${ABV_MIN} and ${ABV_MAX} (percentage, not decimal fraction).`);
  }
}

/** CSC historical schema used US liquid gallons for *_gal columns. */
export const HISTORICAL_GALLON_UNIT: 'US_liquid_gallon' = 'US_liquid_gallon';
