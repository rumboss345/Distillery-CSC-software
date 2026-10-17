import type { ReactNode } from 'react';
import { downloadCsv, rowsToCsv } from '../../lib/reporting/csv';

export interface ReportTableShellProps {
  title: string;
  description?: string;
  periodLabel: string;
  csvFilename: string;
  csvHeaders: string[];
  csvRows: (string | number | null | undefined)[][];
  emptyMessage?: string;
  isEmpty: boolean;
  /** When false, children are not wrapped in a single scrolling table frame. */
  tableWrap?: boolean;
  children: ReactNode;
}

export function ReportTableShell({
  title,
  description,
  periodLabel,
  csvFilename,
  csvHeaders,
  csvRows,
  emptyMessage,
  isEmpty,
  tableWrap = true,
  children,
}: ReportTableShellProps) {
  return (
    <div className="section">
      <div className="report-section-header">
        <div>
          <h3 className="section-title">{title} — {periodLabel}</h3>
          {description && (
            <p className="report-section-desc">{description}</p>
          )}
        </div>
        {!isEmpty && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => downloadCsv(csvFilename, rowsToCsv(csvHeaders, csvRows))}
          >
            Export CSV
          </button>
        )}
      </div>
      {isEmpty ? (
        <div className="empty-state">
          <p>{emptyMessage ?? 'No rows for this period.'}</p>
        </div>
      ) : tableWrap ? (
        <div className="table-wrap">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
