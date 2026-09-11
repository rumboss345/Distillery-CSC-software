import { useEffect, useState } from 'react';
import type { CostStatus } from '../../../shared/costing/constants';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { finishedGoodsRepository } from '../../db/repositories/finished-goods-repository';
import type { FgLot } from '../../types/finished-goods';

export function FgLotsPage() {
  const [lots, setLots] = useState<FgLot[]>([]);

  useEffect(() => {
    setLots(finishedGoodsRepository.listFgLots());
  }, []);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>FG Lot</th>
          <th>Printed Lot</th>
          <th>Production Date</th>
          <th>Initial Qty</th>
          <th>On Hand</th>
          <th>Unit Cost</th>
          <th>Total Cost</th>
          <th>Cost Status</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((lot) => {
          const onHand = finishedGoodsRepository.computeFgLotBalance(lot.id);
          return (
            <tr key={lot.id}>
              <td>{lot.fg_lot_code}</td>
              <td>{lot.printed_lot_code ?? '—'}</td>
              <td>{lot.production_date}</td>
              <td>{lot.initial_quantity}</td>
              <td>{onHand}</td>
              <td>{formatCostDisplay(lot.unit_cost_kyd, lot.cost_status as CostStatus)}</td>
              <td>{formatCostDisplay(lot.total_cost_kyd, lot.cost_status as CostStatus)}</td>
              <td>{lot.cost_status.replace(/_/g, ' ')}</td>
              <td>{lot.status}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
