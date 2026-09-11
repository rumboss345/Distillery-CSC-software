import { formatCostDisplay } from '../../../shared/costing/validation';
import { reportingRepository } from '../../db/repositories/reporting-repository';

function formatKyd(value: number | null): string {
  if (value == null) return formatCostDisplay(null, 'UNVALUED');
  return `KYD ${value.toFixed(2)}`;
}

export function ExecutiveDashboardPage() {
  const summary = reportingRepository.getExecutiveDashboardSummary();
  const warnings = reportingRepository.listUnvaluedInventoryWarnings();

  return (
    <>
      <section className="card">
        <h2>Executive Overview</h2>
        <p className="page-subtitle">
          Inventory values use ledger balances only — legacy floor volumes are excluded.
        </p>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">FG Inventory Value</span>
            <span className="stat-value">{formatKyd(summary.fgValueKyd)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Material Inventory Value</span>
            <span className="stat-value">{formatKyd(summary.materialValueKyd)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Liquid Inventory Value</span>
            <span className="stat-value">{formatKyd(summary.liquidValueKyd)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Production In Progress</span>
            <span className="stat-value">{summary.productionInProgress}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">PO Outstanding</span>
            <span className="stat-value">{summary.poOutstanding}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Material Shortages (MRP)</span>
            <span className="stat-value">{summary.shortages}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">QA Holds</span>
            <span className="stat-value">{summary.qaHolds}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Maintenance Due</span>
            <span className="stat-value">{summary.maintenanceDue}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">FG Depletion (units)</span>
            <span className="stat-value">{summary.fgDepletionUnits.toFixed(0)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Operational COGS (KYD)</span>
            <span className="stat-value">{summary.operationalCogsKyd.toFixed(2)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Unvalued Inventory Warnings</span>
            <span className="stat-value">{summary.unvaluedInventoryWarnings}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Valuation Status</span>
            <span className="stat-value">{summary.valuationStatus.replace(/_/g, ' ')}</span>
          </div>
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="card">
          <h2>Unvalued Inventory Warnings</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {warnings.map((row) => (
                  <tr key={`${row.inventoryType}-${row.entityCode}`}>
                    <td>{row.inventoryType}</td>
                    <td><strong>{row.entityCode}</strong></td>
                    <td>{row.description}</td>
                    <td>{row.quantity.toFixed(2)}</td>
                    <td>{row.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
