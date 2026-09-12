/**
 * QuickBooks adapter interface — browser-local export formatting only (no live sync).
 * Implementations prepare handoff payloads for QBO or QBD import workflows.
 */
import type { ExportFormat, QuickBooksAdapterType } from './constants.js';

export type AccountingExportLine = {
  eventCode: string;
  eventType: string;
  eventDate: string;
  description: string;
  debitAccountNumber: string;
  debitAccountName: string;
  creditAccountNumber: string;
  creditAccountName: string;
  amountKyd: number;
  sourceEntityType: string | null;
  sourceEntityId: number | null;
  idempotencyKey: string;
};

export type QuickBooksExportPayload = {
  adapterType: QuickBooksAdapterType;
  format: ExportFormat;
  batchCode: string;
  exportedAt: string;
  lines: AccountingExportLine[];
  metadata: Record<string, unknown>;
};

export interface QuickBooksAdapter {
  readonly adapterType: QuickBooksAdapterType;
  formatJournalEntries(lines: AccountingExportLine[]): QuickBooksExportPayload;
  validateExportLine(line: AccountingExportLine): string | null;
}

/** QBO-oriented journal entry handoff (CSV/JSON import prep — no API calls). */
export class QuickBooksOnlineAdapter implements QuickBooksAdapter {
  readonly adapterType = 'QuickBooksOnline' as const;

  validateExportLine(line: AccountingExportLine): string | null {
    if (!line.debitAccountNumber || !line.creditAccountNumber) {
      return 'Debit and credit accounts are required.';
    }
    if (!(line.amountKyd > 0)) return 'Amount must be positive.';
    return null;
  }

  formatJournalEntries(lines: AccountingExportLine[]): QuickBooksExportPayload {
    const validated = lines.map((line) => {
      const err = this.validateExportLine(line);
      if (err) throw new Error(`${line.eventCode}: ${err}`);
      return line;
    });
    return {
      adapterType: this.adapterType,
      format: 'JSON',
      batchCode: '',
      exportedAt: new Date().toISOString(),
      lines: validated,
      metadata: {
        journalType: 'JournalEntry',
        currency: 'KYD',
        importTarget: 'QuickBooks Online (manual import)',
      },
    };
  }
}

/** QBD IIF/CSV-oriented handoff (no live sync). */
export class QuickBooksDesktopAdapter implements QuickBooksAdapter {
  readonly adapterType = 'QuickBooksDesktop' as const;

  validateExportLine(line: AccountingExportLine): string | null {
    if (!line.debitAccountNumber || !line.creditAccountNumber) {
      return 'Debit and credit accounts are required.';
    }
    if (!(line.amountKyd > 0)) return 'Amount must be positive.';
    return null;
  }

  formatJournalEntries(lines: AccountingExportLine[]): QuickBooksExportPayload {
    const validated = lines.map((line) => {
      const err = this.validateExportLine(line);
      if (err) throw new Error(`${line.eventCode}: ${err}`);
      return line;
    });
    return {
      adapterType: this.adapterType,
      format: 'CSV',
      batchCode: '',
      exportedAt: new Date().toISOString(),
      lines: validated,
      metadata: {
        journalType: 'GENERAL JOURNAL',
        currency: 'KYD',
        importTarget: 'QuickBooks Desktop (manual import)',
      },
    };
  }
}

export function getQuickBooksAdapter(adapterType: QuickBooksAdapterType): QuickBooksAdapter | null {
  switch (adapterType) {
    case 'QuickBooksOnline':
      return new QuickBooksOnlineAdapter();
    case 'QuickBooksDesktop':
      return new QuickBooksDesktopAdapter();
    default:
      return null;
  }
}
