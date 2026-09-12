import { useEffect, useState } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { finishedGoodsRepository } from '../../db/repositories/finished-goods-repository';
import type { FgTransaction } from '../../types/finished-goods';

export function FgTransactionsPage() {
  const [rows, setRows] = useState<FgTransaction[]>([]);

  useEffect(() => {
    setRows(finishedGoodsRepository.listFgTransactions());
  }, []);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Type</th>
          <th>FG Lot</th>
          <th>Qty</th>
          <th>Unit Cost</th>
          <th>Extended</th>
          <th>Timestamp</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.transaction_code}</td>
            <td>{row.transaction_type}</td>
            <td>{row.fg_lot_id}</td>
            <td>{Number.isInteger(row.quantity) ? row.quantity : row.quantity.toFixed(2)}</td>
            <td>{formatCostDisplay(row.unit_cost_kyd_snapshot, row.unit_cost_kyd_snapshot != null ? 'VALUED' : 'UNVALUED')}</td>
            <td>{formatCostDisplay(row.extended_cost_kyd, row.extended_cost_kyd != null ? 'VALUED' : 'UNVALUED')}</td>
            <td>{row.transaction_timestamp.slice(0, 19)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
