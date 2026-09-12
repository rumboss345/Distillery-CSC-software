import { useEffect, useState } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { barrelAgingRepository } from '../../db/repositories/barrel-aging-repository';

export function BarrelDashboardPage() {
  const [summary, setSummary] = useState(barrelAgingRepository.getBarrelDashboardSummary());

  useEffect(() => {
    setSummary(barrelAgingRepository.getBarrelDashboardSummary());
  }, []);

  return (
    <div className="dashboard-grid">
      <div className="stat-card">
        <div className="label">Total Barrels</div>
        <div className="value">{summary.totalBarrels}</div>
      </div>
      <div className="stat-card">
        <div className="label">Barrels Aging</div>
        <div className="value accent">{summary.agingBarrels}</div>
      </div>
      <div className="stat-card">
        <div className="label">Empty Barrels</div>
        <div className="value">{summary.emptyBarrels}</div>
      </div>
      <div className="stat-card">
        <div className="label">Volume Aging (L)</div>
        <div className="value">{summary.totalAgingVolumeLitres.toFixed(1)}</div>
      </div>
      <div className="stat-card">
        <div className="label">Barrel Asset Cost</div>
        <div className="value">{formatCostDisplay(summary.totalBarrelAssetCostKyd, 'VALUED')}</div>
      </div>
      <div className="stat-card">
        <div className="label">Liquid Cost in Barrels</div>
        <div className="value">{formatCostDisplay(summary.totalLiquidCostKyd, 'VALUED')}</div>
      </div>
    </div>
  );
}
