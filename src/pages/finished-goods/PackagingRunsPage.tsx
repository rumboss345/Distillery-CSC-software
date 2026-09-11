import { useEffect, useState } from 'react';
import { finishedGoodsRepository } from '../../db/repositories/finished-goods-repository';
import type { PkgRun } from '../../types/finished-goods';

export function PackagingRunsPage() {
  const [runs, setRuns] = useState<PkgRun[]>([]);

  useEffect(() => {
    setRuns(finishedGoodsRepository.listPackagingRuns());
  }, []);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Run Code</th>
          <th>Batch</th>
          <th>SKU</th>
          <th>Planned</th>
          <th>Actual Good</th>
          <th>Liquid Used (L)</th>
          <th>Packaging Yield %</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td>{run.run_code}</td>
            <td>{run.production_batch_id}</td>
            <td>{run.sku_id}</td>
            <td>{run.planned_quantity}</td>
            <td>{run.actual_good_quantity ?? '—'}</td>
            <td>{run.liquid_consumed_litres?.toFixed(2) ?? '—'}</td>
            <td>{run.packaging_yield_percent?.toFixed(1) ?? '—'}</td>
            <td>{run.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
