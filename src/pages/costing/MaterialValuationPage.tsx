import { useEffect, useState } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { CostingRepository } from '../../db/repositories/costing-repository';
import type { MaterialLotValuationRow } from '../../types/costing';

export function MaterialValuationPage() {
  const [rows, setRows] = useState<MaterialLotValuationRow[]>([]);

  useEffect(() => {
    setRows(CostingRepository.listMaterialValuations());
  }, []);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Material</th>
          <th>Lot</th>
          <th>Supplier</th>
          <th>Receipt</th>
          <th>Received Qty</th>
          <th>Remaining Qty</th>
          <th>Purchase Cost</th>
          <th>Landed Cost</th>
          <th>Total Lot Cost</th>
          <th>Unit Cost</th>
          <th>Remaining Value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.material_lot_id}>
            <td>{row.material_name}</td>
            <td>{row.lot_code}</td>
            <td>{row.supplier_name ?? '—'}</td>
            <td>{row.receipt_code ?? '—'}</td>
            <td>{row.received_qty}</td>
            <td>{row.remaining_qty}</td>
            <td>{formatCostDisplay(row.purchase_cost_kyd, row.cost_status)}</td>
            <td>{formatCostDisplay(row.landed_cost_kyd, row.cost_status)}</td>
            <td>{formatCostDisplay(row.total_cost_kyd, row.cost_status)}</td>
            <td>{formatCostDisplay(row.unit_cost_kyd, row.cost_status)}</td>
            <td>{formatCostDisplay(row.remaining_value_kyd, row.cost_status)}</td>
            <td>{row.cost_status.replace(/_/g, ' ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
