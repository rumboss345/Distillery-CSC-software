import { useEffect, useState } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { CostingRepository } from '../../db/repositories/costing-repository';
import type { LiquidLotValuationRow } from '../../types/costing';

export function LiquidValuationPage() {
  const [rows, setRows] = useState<LiquidLotValuationRow[]>([]);

  useEffect(() => {
    setRows(CostingRepository.listLiquidValuations());
  }, []);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Liquid Lot</th>
          <th>Type</th>
          <th>Volume (L)</th>
          <th>ABV</th>
          <th>LPA</th>
          <th>Accumulated Cost</th>
          <th>Cost/L</th>
          <th>Cost/LPA</th>
          <th>Status</th>
          <th>Source Batch</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.liquid_lot_id}>
            <td>{row.lot_code}</td>
            <td>{row.lot_type}</td>
            <td>{row.current_volume_litres.toFixed(2)}</td>
            <td>{row.current_abv.toFixed(1)}%</td>
            <td>{row.current_lpa.toFixed(2)}</td>
            <td>{formatCostDisplay(row.accumulated_cost_kyd, row.cost_status)}</td>
            <td>{formatCostDisplay(row.cost_per_litre_kyd, row.cost_status)}</td>
            <td>{formatCostDisplay(row.cost_per_lpa_kyd, row.cost_status)}</td>
            <td>{row.cost_status.replace(/_/g, ' ')}</td>
            <td>{row.source_batch_code ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
