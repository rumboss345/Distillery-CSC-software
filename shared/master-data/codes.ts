import { CODE_PREFIXES } from './constants.js';

export type CodeEntityType = keyof typeof CODE_PREFIXES;

/** Format a business code from prefix and sequence number. */
export function formatBusinessCode(prefix: string, sequence: number, pad = 4): string {
  return `${prefix}-${String(sequence).padStart(pad, '0')}`;
}

export function codePrefixForEntity(entityType: CodeEntityType): string {
  return CODE_PREFIXES[entityType];
}
