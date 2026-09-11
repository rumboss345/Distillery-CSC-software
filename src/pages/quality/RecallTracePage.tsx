import { useState } from 'react';
import { qualityRepository } from '../../db/repositories/quality-repository';
import type { RecallTraceResult } from '../../types/quality';

export function RecallTracePage() {
  const [supplierLot, setSupplierLot] = useState('');
  const [fgLotId, setFgLotId] = useState('');
  const [trace, setTrace] = useState<RecallTraceResult | null>(null);

  const runForward = () => {
    if (!supplierLot.trim()) return;
    setTrace(qualityRepository.traceRecallForward(supplierLot.trim()));
  };

  const runBackward = () => {
    if (!fgLotId.trim()) return;
    setTrace(qualityRepository.traceRecallBackward(Number(fgLotId)));
  };

  return (
    <section className="card">
      <h2>Recall Traceability</h2>
      <p className="text-muted">
        Forward: supplier lot → material lots → production batches → liquid lots → FG lots.
        Backward: FG lot → batches &amp; liquid lots → material lots → supplier lots.
      </p>
      <div className="form-row">
        <input value={supplierLot} onChange={(e) => setSupplierLot(e.target.value)} placeholder="Supplier lot number" />
        <button type="button" className="btn btn-primary" onClick={runForward}>Trace Forward</button>
      </div>
      <div className="form-row">
        <input value={fgLotId} onChange={(e) => setFgLotId(e.target.value)} placeholder="FG lot ID" />
        <button type="button" className="btn btn-primary" onClick={runBackward}>Trace Backward</button>
      </div>
      {trace && (
        <>
          <h3>{trace.direction === 'forward' ? 'Forward' : 'Backward'} trace from {trace.anchor}</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Code</th>
                <th>Label</th>
                <th>Supplier Lot</th>
              </tr>
            </thead>
            <tbody>
              {trace.nodes.map((n, i) => (
                <tr key={`${n.level}-${n.id}-${i}`}>
                  <td>{n.level}</td>
                  <td>{n.code}</td>
                  <td>{n.label}</td>
                  <td>{n.supplier_lot_number ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
