/** Format receipt posting errors with material-specific guidance. */

import { LEGACY_RECEIPT_BLOCK_MESSAGE } from './constants.js';

export interface ReceiptLineMaterialRef {
  materialName: string;
  materialType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
}

export function formatLegacyReceiptBlockMessage(materials: readonly ReceiptLineMaterialRef[]): string {
  if (materials.length === 0) {
    return LEGACY_RECEIPT_BLOCK_MESSAGE;
  }
  if (materials.length === 1) {
    const m = materials[0]!;
    return `${m.materialName} is still LEGACY-tracked. Activate ledger tracking and establish an opening balance before posting this receipt.`;
  }
  const names = materials.map((m) => m.materialName).join(', ');
  return `These materials are still LEGACY-tracked: ${names}. Activate ledger tracking and establish opening balances before posting this receipt.`;
}

export function isLegacyReceiptBlockError(message: string): boolean {
  return message.includes('LEGACY-tracked') || message.includes(LEGACY_RECEIPT_BLOCK_MESSAGE);
}
