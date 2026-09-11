import { useEffect, useState } from 'react';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { queryAll } from '../../db/database';
import { CostingRepository } from '../../db/repositories/costing-repository';

type BatchRow = {
  id: number;
  batch_code: string;
  production_type: string;
  status: string;
  actual_output_litres: number | null;
  cost_status: string;
  total_cost_kyd: number | null;
  cost_per_litre_kyd: number | null;
};

export function BatchCostingPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const refresh = () => {
    const rows = queryAll<BatchRow & { unvalued_input_count?: number; snapshot_status?: string }>(
      `SELECT b.id, b.batch_code, o.production_type, b.status, b.actual_output_litres,
              CASE WHEN s.unvalued_input_count > 0 THEN 'PARTIALLY_VALUED'
                   WHEN s.total_cost_kyd IS NOT NULL THEN 'VALUED'
                   ELSE 'UNVALUED' END AS cost_status,
              s.total_cost_kyd, s.cost_per_litre_kyd
       FROM prod_batches b
       JOIN prod_orders o ON o.id = b.production_order_id
       LEFT JOIN cost_batch_snapshots s ON s.production_batch_id = b.id
         AND s.id = (SELECT MAX(id) FROM cost_batch_snapshots WHERE production_batch_id = b.id)
       ORDER BY b.id DESC`,
    );
    setBatches(rows);
  };

  useEffect(() => { refresh(); }, []);

  const handleFinalize = (batchId: number) => {
    if (!window.confirm(
      'This freezes the historical cost snapshot. Corrections require an adjustment.',
    )) return;
    try {
      CostingRepository.finalizeBatchCost(batchId, true);
      setMessage('Batch cost finalized.');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Finalization failed.');
    }
  };

  const breakdown = selectedId ? CostingRepository.getBatchCostBreakdown(selectedId) : null;

  return (
    <div>
      {message && <p className="info-banner">{message}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Batch #</th>
            <th>Type</th>
            <th>Status</th>
            <th>Cost Status</th>
            <th>Actual Cost</th>
            <th>Cost/L</th>
            <th>Output (L)</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td>{b.batch_code}</td>
              <td>{b.production_type}</td>
              <td>{b.status}</td>
              <td>{b.cost_status?.replace(/_/g, ' ') ?? 'UNVALUED'}</td>
              <td>{formatCostDisplay(b.total_cost_kyd, (b.cost_status ?? 'UNVALUED') as 'UNVALUED')}</td>
              <td>{formatCostDisplay(b.cost_per_litre_kyd, (b.cost_status ?? 'UNVALUED') as 'UNVALUED')}</td>
              <td>{b.actual_output_litres?.toFixed(2) ?? '—'}</td>
              <td>
                <button type="button" className="btn btn-sm" onClick={() => setSelectedId(b.id)}>Detail</button>
                {b.status === 'Completed' && (
                  <button type="button" className="btn btn-sm" onClick={() => handleFinalize(b.id)}>Finalize Cost</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {breakdown && (
        <section className="panel" style={{ marginTop: '1.5rem' }}>
          <h3>Batch {breakdown.batchCode} — Cost Breakdown</h3>
          <h4>Material Costs</h4>
          <table className="data-table">
            <thead>
              <tr><th>Material</th><th>Lot</th><th>Qty</th><th>Unit Cost</th><th>Extended</th></tr>
            </thead>
            <tbody>
              {breakdown.materialCosts.map((m, i) => (
                <tr key={i}>
                  <td>{m.materialName}</td>
                  <td>{m.lotCode}</td>
                  <td>{m.quantity} {m.unit}</td>
                  <td>{formatCostDisplay(m.unitCostKyd, m.costStatus)}</td>
                  <td>{formatCostDisplay(m.extendedCostKyd, m.costStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>Liquid Costs</h4>
          <table className="data-table">
            <thead>
              <tr><th>Lot</th><th>Volume</th><th>Cost/L</th><th>Extended</th></tr>
            </thead>
            <tbody>
              {breakdown.liquidCosts.map((l, i) => (
                <tr key={i}>
                  <td>{l.lotCode}</td>
                  <td>{l.volumeLitres.toFixed(2)} L</td>
                  <td>{formatCostDisplay(l.costPerLitreKyd, 'UNVALUED')}</td>
                  <td>{formatCostDisplay(l.extendedCostKyd, 'UNVALUED')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
