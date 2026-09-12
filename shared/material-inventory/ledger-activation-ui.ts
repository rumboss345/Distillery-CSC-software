/** Pure helpers for material ledger activation UI — testable without React. */

import type { InventoryTrackingMode, MaterialType } from './constants.js';

export const ACTIVATE_LEDGER_CONFIRM_TEXT = 'ACTIVATE LEDGER';

export interface MaterialTrackingRow {
  id: number;
  name: string;
  code: string;
  inventoryUnit: string;
  trackingMode: InventoryTrackingMode;
  ledgerActivatedAt?: string | null;
  ledgerActivationReference?: string | null;
}

export interface MaterialLedgerDisplay {
  trackingLabel: InventoryTrackingMode;
  ledgerBalanceLabel: string;
  activatedAtLabel: string | null;
  activationReference: string | null;
  showActivateAction: boolean;
  showDowngradeAction: boolean;
}

export function showActivateLedgerAction(trackingMode: InventoryTrackingMode): boolean {
  return trackingMode === 'LEGACY';
}

export function showDowngradeToLegacyAction(
  trackingMode: InventoryTrackingMode,
  hasLedgerTransactions: boolean,
): boolean {
  return trackingMode === 'LEDGER' && !hasLedgerTransactions;
}

export function buildMaterialLedgerDisplay(input: {
  trackingMode: InventoryTrackingMode;
  onHand: number;
  ledgerActivatedAt?: string | null;
  ledgerActivationReference?: string | null;
  hasLedgerTransactions: boolean;
}): MaterialLedgerDisplay {
  if (input.trackingMode === 'LEGACY') {
    return {
      trackingLabel: 'LEGACY',
      ledgerBalanceLabel: 'Not Activated',
      activatedAtLabel: null,
      activationReference: null,
      showActivateAction: true,
      showDowngradeAction: false,
    };
  }
  return {
    trackingLabel: 'LEDGER',
    ledgerBalanceLabel: input.onHand.toFixed(3),
    activatedAtLabel: formatActivationTimestamp(input.ledgerActivatedAt),
    activationReference: input.ledgerActivationReference ?? null,
    showActivateAction: false,
    showDowngradeAction: showDowngradeToLegacyAction(input.trackingMode, input.hasLedgerTransactions),
  };
}

export function formatActivationTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function validateActivationForm(input: {
  reference: string;
  confirmText?: string;
  requireTypedConfirm?: boolean;
}): string | null {
  if (!input.reference.trim()) {
    return 'Activation reference is required (e.g. Physical count 2026-09-11).';
  }
  if (input.requireTypedConfirm && input.confirmText?.trim() !== ACTIVATE_LEDGER_CONFIRM_TEXT) {
    return `Type ${ACTIVATE_LEDGER_CONFIRM_TEXT} to confirm.`;
  }
  return null;
}

export function materialTypeForKind(kind: 'raw' | 'packaging'): MaterialType {
  return kind === 'raw' ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL';
}

export function materialIdForRow(_kind: 'raw' | 'packaging', row: { id: number }): number {
  return row.id;
}
