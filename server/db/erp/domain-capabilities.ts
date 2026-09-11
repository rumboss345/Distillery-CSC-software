import type { ErpApiDomain } from '../../routes/erp/index.js';

export type CapabilityLevel = 'IMPLEMENTED' | 'PARTIAL' | 'STUB';

export interface DomainCapability {
  domain: ErpApiDomain;
  read: CapabilityLevel;
  write: CapabilityLevel;
  bootstrap: boolean;
}

/**
 * Registry of ERP domain API capabilities.
 * IMPLEMENTED is set only when real PG handlers exist — not status stubs.
 */
export const DOMAIN_CAPABILITIES: DomainCapability[] = [
  { domain: 'material', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'liquid', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'finished-goods', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'sales', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'quality', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'warehouse', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'barrel', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'production', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'costing', read: 'IMPLEMENTED', write: 'PARTIAL', bootstrap: true },
  { domain: 'accounting', read: 'IMPLEMENTED', write: 'IMPLEMENTED', bootstrap: true },
  { domain: 'reporting', read: 'IMPLEMENTED', write: 'STUB', bootstrap: false },
  { domain: 'admin', read: 'IMPLEMENTED', write: 'PARTIAL', bootstrap: true },
];

export function getDomainCapability(domain: ErpApiDomain): DomainCapability | undefined {
  return DOMAIN_CAPABILITIES.find((d) => d.domain === domain);
}

export function allDomainsImplemented(): boolean {
  return DOMAIN_CAPABILITIES.every(
    (d) => d.read === 'IMPLEMENTED' && (d.write === 'IMPLEMENTED' || d.write === 'PARTIAL'),
  );
}
