import { useEffect, useState } from 'react';
import { formatCostQuantity } from '../../../shared/costing/display';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { queryAll } from '../../db/database';
import { CostingRepository } from '../../db/repositories/costing-repository';

type BatchRow = {
  id: number;
  batch_code: string;
  production_type: string;
  status: string;
  actual_output_litres: number | null;
  actual_output_abv: number | null;
  cost_status: string;
  total_cost_kyd: number | null;
  cost_per_litre_kyd: number | null;
  snapshot_type: string | null;
};

export function BatchCostingPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [convType, setConvType] = useState('Labor');
  const [convAmount, setConvAmount] = useState('');

  const refresh = () => {
    const rows = queryAll<BatchRow>(
      `SELECT b.id, b.batch_code, o.production_type, b.status, b.actual_output_litres, b.actual_output_abv,
              COALESCE(s.status, 'UNVALUED') AS cost_status,
              s.total_cost_kyd, s.cost_per_litre_kyd, s.snapshot_type
       FROM prod_batches b
       JOIN prod_orders o ON o.id = b.production_order_id
       LEFT JOIN cost_batch_snapshots s ON s.production_batch_id = b.id
         AND s.id = (SELECT MAX(id) FROM cost_batch_snapshots WHERE production_batch_id = b.id)
       ORDER BY b.id DESC`,
    );
    setBatches(rows);
  };

  useEffect(() => { refresh(); }, []);

  const handleRecalculate = (batchId: number) => {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch?.actual_output_litres) return;
    try {
      const lpa = batch.actual_output_litres * ((batch.actual_output_abv ?? 0) / 100);
      CostingRepository.recalculatePreliminaryBatchSnapshot(batchId, batch.actual_output_litres, lpa);
      setMessage('Preliminary cost recalculated.');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Recalculate failed.');
    }
  };

  const handleAddConversion = (batchId: number) => {
    if (!convAmount) return;
    try {
      CostingRepository.addConversionCost({
        productionBatchId: batchId,
        costType: convType,
        description: convType,
        originalAmount: Number(convAmount),
      });
      setMessage('Conversion cost added.');
      setConvAmount('');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Add conversion failed.');
    }
  };

  const handleFinalize = (batchId: number) => {
    if (!window.confirm(
      'This freezes the historical cost snapshot. Corrections require an adjustment.',
    )) return;
    try {
      CostingRepository.finalizeBatchCost(batchId, true);
      setMessage('Batch cost finalized (Final snapshot immutable).');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Finalization failed.');
    }
  };

  const breakdown = selectedId ? CostingRepository.getBatchCostBreakdown(selectedId) : null;
  const trace = selectedId ? CostingRepository.getCostTraceability(selectedId) : null;
  const flags = selectedId ? CostingRepository.getPostConsumptionFlags({ batchId: selectedId }) : [];

  return (
    <div>
      {message && <p className="info-banner">{message}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Batch #</th><th>Type</th><th>Status</th><th>Cost Status</th>
            <th>Actual Cost</th><th>Cost/L</th><th>Output (L)</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td>{b.batch_code}</td>
              <td>{b.production_type}</td>
              <td>{b.status}</td>
              <td>{b.cost_status?.replace(/_/g, ' ') ?? 'UNVALUED'}</td>
              <td>{formatCostDisplay(b.total_cost_kyd, b.cost_status as 'UNVALUED')}</td>
              <td>{formatCostDisplay(b.cost_per_litre_kyd, b.cost_status as 'UNVALUED')}</td>
              <td>{b.actual_output_litres?.toFixed(2) ?? '—'}</td>
              <td>
                <button type="button" className="btn btn-sm" onClick={() => setSelectedId(b.id)}>Detail</button>
                {b.status === 'Completed' && b.snapshot_type !== 'Final' && (
                  <>
                    <button type="button" className="btn btn-sm" onClick={() => handleRecalculate(b.id)}>Recalc</button>
                    <button type="button" className="btn btn-sm" onClick={() => handleFinalize(b.id)}>Finalize</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {breakdown && selectedId && (
        <section className="panel" style={{ marginTop: '1.5rem' }}>
          <h3>Batch {breakdown.batchCode} — Cost Breakdown</h3>
          {breakdown.snapshot?.snapshot_type === 'Final' && breakdown.snapshot.status === 'Finalized' && (
            <p className="info-banner">Final cost snapshot — immutable. Use Cost Adjustments for corrections.</p>
          )}

          <h4>Material Costs</h4>
          <table className="data-table">
            <thead>
              <tr><th>Material</th><th>Lot</th><th>Qty</th><th>Unit Cost</th><th>Extended</th><th>Receipt</th></tr>
            </thead>
            <tbody>
              {breakdown.materialCosts.map((m, i) => (
                <tr key={i}>
                  <td>{m.materialName}</td>
                  <td>{m.lotCode}</td>
                  <td>{formatCostQuantity(m.quantity, m.unit)}</td>
                  <td>{formatCostDisplay(m.unitCostKyd, m.costStatus)}</td>
                  <td>{formatCostDisplay(m.extendedCostKyd, m.costStatus)}</td>
                  <td>{m.receiptCode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Liquid Costs</h4>
          <table className="data-table">
            <thead>
              <tr><th>Lot</th><th>Volume</th><th>ABV</th><th>LPA</th><th>Cost/L</th><th>Extended</th></tr>
            </thead>
            <tbody>
              {breakdown.liquidCosts.map((l, i) => (
                <tr key={i}>
                  <td>{l.lotCode}</td>
                  <td>{l.volumeLitres.toFixed(2)} L</td>
                  <td>{l.abv.toFixed(1)}%</td>
                  <td>{l.lpa.toFixed(2)}</td>
                  <td>{formatCostDisplay(l.costPerLitreKyd, 'UNVALUED')}</td>
                  <td>{formatCostDisplay(l.extendedCostKyd, 'UNVALUED')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Conversion Costs</h4>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Description</th><th>Amount (KYD)</th></tr></thead>
            <tbody>
              {breakdown.conversionCosts.map((c, i) => (
                <tr key={i}><td>{c.costType}</td><td>{c.description}</td><td>{c.amountKyd.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label>Type<select value={convType} onChange={(e) => setConvType(e.target.value)}>
              {['Labor', 'Utilities', 'Fuel', 'External Service', 'Production Supplies', 'Overhead', 'Other'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select></label>
            <label>Amount (KYD)<input value={convAmount} onChange={(e) => setConvAmount(e.target.value)} type="number" step="0.01" /></label>
            <button type="button" className="btn" onClick={() => handleAddConversion(selectedId)}>Add Conversion Cost</button>
          </div>

          {flags.length > 0 && (
            <>
              <h4>Post-Consumption Cost Adjustments</h4>
              <table className="data-table">
                <thead><tr><th>Lot</th><th>Amount</th><th>Status</th><th>Notes</th></tr></thead>
                <tbody>
                  {flags.map((f) => (
                    <tr key={f.id}>
                      <td>{f.material_lot_id}</td>
                      <td>{f.adjustment_amount_kyd.toFixed(2)}</td>
                      <td>{f.status}</td>
                      <td>{f.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {trace && (
            <>
              <h4>Traceability</h4>
              <ul>
                <li>{trace.entityType}: {trace.code} — {formatCostDisplay(trace.costKyd, 'UNVALUED')}</li>
                {trace.children.map((c, i) => (
                  <li key={i} style={{ marginLeft: '1.5rem' }}>
                    {c.entityType}: {c.code} — {formatCostDisplay(c.costKyd, 'UNVALUED')} ({c.description})
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
