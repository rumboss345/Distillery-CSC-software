import { useEffect, useState } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { finishedGoodsRepository } from '../../db/repositories/finished-goods-repository';

export function FinishedGoodsDashboardPage() {
  const [summary, setSummary] = useState(finishedGoodsRepository.getFgDashboardSummary());

  useEffect(() => {
    setSummary(finishedGoodsRepository.getFgDashboardSummary());
  }, []);

  return (
    <div className="dashboard-grid">
      <div className="stat-card">
        <div className="label">Finished Goods Lots</div>
        <div className="value">{summary.totalLots}</div>
      </div>
      <div className="stat-card">
        <div className="label">Units On Hand</div>
        <div className="value">{summary.totalUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      </div>
      <div className="stat-card">
        <div className="label">Valued Inventory</div>
        <div className="value">{formatCostDisplay(summary.valuedInventoryKyd, summary.valuedInventoryKyd != null ? 'VALUED' : 'UNVALUED')}</div>
      </div>
      <div className="stat-card">
        <div className="label">Open Packaging Runs</div>
        <div className="value">{summary.openRuns}</div>
      </div>
    </div>
  );
}
