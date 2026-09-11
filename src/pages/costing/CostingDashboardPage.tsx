import { useEffect, useState } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { CostingRepository } from '../../db/repositories/costing-repository';
import type { CostDashboardSummary } from '../../types/costing';

export function CostingDashboardPage() {
  const [summary, setSummary] = useState<CostDashboardSummary | null>(null);

  useEffect(() => {
    setSummary(CostingRepository.getCostDashboardSummary());
  }, []);

  if (!summary) return <p>Loading costing dashboard...</p>;

  return (
    <div className="dashboard-grid">
      <div className="stat-card">
        <h3>Material Inventory Value</h3>
        <p className="stat-value">
          {summary.materialInventoryValueKyd != null
            ? `KYD ${summary.materialInventoryValueKyd.toFixed(2)}`
            : formatCostDisplay(null, summary.valuationStatus)}
        </p>
      </div>
      <div className="stat-card">
        <h3>Liquid Inventory Value</h3>
        <p className="stat-value">
          {summary.liquidInventoryValueKyd != null
            ? `KYD ${summary.liquidInventoryValueKyd.toFixed(2)}`
            : formatCostDisplay(null, summary.valuationStatus)}
        </p>
      </div>
      <div className="stat-card">
        <h3>Unvalued Material Lots</h3>
        <p className="stat-value">{summary.unvaluedMaterialLots}</p>
      </div>
      <div className="stat-card">
        <h3>Unvalued Liquid Lots</h3>
        <p className="stat-value">{summary.unvaluedLiquidLots}</p>
      </div>
      <div className="stat-card">
        <h3>Batches Awaiting Cost Finalization</h3>
        <p className="stat-value">{summary.batchesAwaitingCostFinalization}</p>
      </div>
      <div className="stat-card">
        <h3>Valuation Status</h3>
        <p className="stat-value">{summary.valuationStatus.replace(/_/g, ' ')}</p>
      </div>

      <section className="panel" style={{ gridColumn: '1 / -1' }}>
        <h3>Recent Landed Cost Documents</h3>
        {summary.recentLandedCostDocuments.length === 0 ? (
          <p className="muted">No landed cost documents yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Status</th>
                <th>Effective Date</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentLandedCostDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.landed_cost_code}</td>
                  <td>{doc.status}</td>
                  <td>{doc.effective_date?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" style={{ gridColumn: '1 / -1' }}>
        <h3>Recent Cost Adjustments</h3>
        {summary.recentAdjustments.length === 0 ? (
          <p className="muted">No cost adjustments yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Target</th>
                <th>Amount (KYD)</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentAdjustments.map((adj) => (
                <tr key={adj.id}>
                  <td>{adj.adjustment_code}</td>
                  <td>{adj.target_type} #{adj.target_id}</td>
                  <td>{adj.amount_kyd.toFixed(2)}</td>
                  <td>{adj.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
