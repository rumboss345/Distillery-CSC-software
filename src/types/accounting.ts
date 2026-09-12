import type {
  AccountingEventStatus,
  AccountingEventType,
  ExportBatchStatus,
  ExportFormat,
  OperationalAccountCategory,
  QuickBooksAdapterType,
  ReconciliationStatus,
} from '../../shared/accounting/constants';

export type AcctAccountMapping = {
  id: number;
  operational_category: OperationalAccountCategory;
  gl_account_number: string;
  gl_account_name: string;
  description: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export type AcctEvent = {
  id: number;
  event_code: string;
  event_type: AccountingEventType;
  operational_category: OperationalAccountCategory | null;
  source_entity_type: string | null;
  source_entity_id: number | null;
  idempotency_key: string;
  event_date: string;
  amount_kyd: number;
  debit_account_number: string;
  debit_account_name: string;
  credit_account_number: string;
  credit_account_name: string;
  description: string;
  status: AccountingEventStatus;
  export_batch_id: number | null;
  reversal_of_event_id: number | null;
  metadata_json: string | null;
  created_at: string;
};

export type AcctExportBatch = {
  id: number;
  batch_code: string;
  export_format: ExportFormat;
  adapter_type: QuickBooksAdapterType;
  status: ExportBatchStatus;
  reconciliation_status: ReconciliationStatus;
  event_count: number;
  total_debit_kyd: number;
  total_credit_kyd: number;
  exported_at: string | null;
  idempotency_key: string | null;
  notes: string;
  created_at: string;
};

export type AcctExportBatchLine = {
  id: number;
  export_batch_id: number;
  accounting_event_id: number;
  exported_at: string;
};

export type CreateAccountMappingInput = {
  operationalCategory: OperationalAccountCategory;
  glAccountNumber: string;
  glAccountName: string;
  description?: string;
};

export type UpdateAccountMappingInput = {
  glAccountNumber?: string;
  glAccountName?: string;
  description?: string;
  active?: boolean;
};

export type StageOperationalEventsResult = {
  staged: number;
  skipped: number;
  byType: Record<string, number>;
};

export type CreateExportBatchInput = {
  eventIds: number[];
  exportFormat: ExportFormat;
  adapterType?: QuickBooksAdapterType;
  notes?: string;
  idempotencyKey?: string;
};

export type AccountingDashboardSummary = {
  pendingEvents: number;
  exportedEvents: number;
  reversedEvents: number;
  pendingCogsKyd: number;
  exportBatches: number;
  unreconciledBatches: number;
  mappingCount: number;
};
