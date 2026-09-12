import { useEffect, useState } from 'react';
import { accountingRepository } from '../../db/repositories/accounting-repository';
import type { AccountingDashboardSummary } from '../../types/accounting';

export function AccountingDashboardPage() {
  const [summary, setSummary] = useState<AccountingDashboardSummary | null>(null);
  const [stageResult, setStageResult] = useState<string | null>(null);

  const refresh = () => {
    setSummary(accountingRepository.getAccountingDashboardSummary());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleStage = () => {
    const result = accountingRepository.stagePendingOperationalEvents();
    setStageResult(`Staged ${result.staged} new event(s).`);
    refresh();
  };

  if (!summary) return <p>Loading accounting dashboard...</p>;

  return (
    <div className="dashboard-grid">
      <div className="stat-card">
        <h3>Pending Events</h3>
        <p className="stat-value">{summary.pendingEvents}</p>
      </div>
      <div className="stat-card">
        <h3>Exported Events</h3>
        <p className="stat-value">{summary.exportedEvents}</p>
      </div>
      <div className="stat-card">
        <h3>Pending COGS (KYD)</h3>
        <p className="stat-value">{summary.pendingCogsKyd.toFixed(2)}</p>
      </div>
      <div className="stat-card">
        <h3>Export Batches</h3>
        <p className="stat-value">{summary.exportBatches}</p>
        {summary.unreconciledBatches > 0 && (
          <p className="muted">{summary.unreconciledBatches} awaiting reconciliation</p>
        )}
      </div>
      <div className="stat-card">
        <h3>Account Mappings</h3>
        <p className="stat-value">{summary.mappingCount}</p>
      </div>
      <div className="stat-card">
        <h3>Reversed Events</h3>
        <p className="stat-value">{summary.reversedEvents}</p>
      </div>

      <section className="panel" style={{ gridColumn: '1 / -1' }}>
        <h3>Stage Operational Events</h3>
        <p className="text-muted">
          Pull immutable staging records from receipts, landed costs, production, shipments, adjustments &amp; cost
          changes. Browser-local only — no external API calls.
        </p>
        <button type="button" className="btn btn-primary" onClick={handleStage}>
          Stage Pending Events
        </button>
        {stageResult && <p className="muted">{stageResult}</p>}
      </section>
    </div>
  );
}
