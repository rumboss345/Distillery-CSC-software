/**
 * Transaction direction model (Phase 1D ledger integrity).
 *
 * Balance effect is defined ONLY by source/destination tank/lot columns — not by type name.
 *
 * | Effect on tank | Condition |
 * |----------------|-----------|
 * | +volume, +LPA  | destination_tank_id set |
 * | −volume, −LPA  | source_tank_id set |
 *
 * | Effect on lot | Condition |
 * |---------------|-----------|
 * | +volume, +LPA | destination_lot_id set |
 * | −volume, −LPA | source_lot_id set |
 *
 * Typical posting patterns:
 * - Opening Balance / Bulk Spirit Receipt / Blend Production / Proof Down Production:
 *   destination tank + lot only
 * - Tank Transfer Out / Blend Consumption / Proof Down Consumption / losses / decreases:
 *   source tank (+ lot) only
 * - Tank Transfer In:
 *   destination tank + lot only (paired with Transfer Out — no double count per tank)
 * - Proof Down Water Addition:
 *   destination tank only, ABV=0, LPA=0
 * - Manual Adjustment Increase: destination tank (+ optional lot)
 * - Manual Adjustment Decrease: source tank (+ optional lot)
 * - Correction / Reversal: swaps source↔dest from original (exact offset when paired)
 *
 * Paired transfers use two rows; each tank touched once as source OR destination.
 */

export const TRANSACTION_EFFECTS_DOC = 'See shared/liquid-ledger/transaction-effects.ts';
