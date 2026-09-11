import { useEffect, useState } from 'react';
import type { CostStatus } from '../../../shared/costing/constants';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { finishedGoodsRepository } from '../../db/repositories/finished-goods-repository';
import type { FgInventoryRow } from '../../types/finished-goods';

export function FgInventoryPage() {
  const [rows, setRows] = useState<FgInventoryRow[]>([]);

  useEffect(() => {
    setRows(finishedGoodsRepository.listFgInventory());
  }, []);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>FG Lot</th>
          <th>Printed Lot</th>
          <th>SKU</th>
          <th>Location</th>
          <th>Qty (each)</th>
          <th>Unit Cost</th>
          <th>Extended</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.fg_lot_id}-${row.location_id ?? 'x'}`}>
            <td>{row.fg_lot_code}</td>
            <td>{row.printed_lot_code ?? '—'}</td>
            <td>{row.sku_code}</td>
            <td>{row.location_name ?? '—'}</td>
            <td>{Number.isInteger(row.quantity) ? row.quantity : row.quantity.toFixed(2)}</td>
            <td>{formatCostDisplay(row.unit_cost_kyd, row.cost_status as CostStatus)}</td>
            <td>{formatCostDisplay(row.extended_cost_kyd, row.cost_status as CostStatus)}</td>
            <td>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
