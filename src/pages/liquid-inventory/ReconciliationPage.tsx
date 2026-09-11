import { useState } from 'react';
import { LOSS_REASON_CODES } from '../../../shared/liquid-ledger/constants';
import { useAuth } from '../../context/AuthContext';
import { liquidInventoryRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';

export function ReconciliationPage() {
  const { user } = useAuth();
  const { key, refresh } = useRefreshKey();
  const tanks = liquidInventoryRepository.tanks.listTanks();
  const [tankId, setTankId] = useState(0);
  const [measured, setMeasured] = useState('');
  const [reason, setReason] = useState('Measurement Correction');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  void key;

  const preview = tankId && measured !== ''
    ? liquidInventoryRepository.previewReconciliation(tankId, Number(measured))
    : null;

  const history = liquidInventoryRepository.getReconciliations(tankId || undefined);

  const handlePost = () => {
    try {
      setError('');
      liquidInventoryRepository.ledger.reconcileTank({
        tankId,
        measuredVolumeLitres: Number(measured),
        reasonCode: reason,
        notes,
        createdBy: user?.email ?? null,
      });
      setMeasured('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed');
    }
  };

  return (
    <section className="card">
      <h2>Tank Reconciliation</h2>
      <p className="text-muted">
        Compare physical measurement to ledger-calculated balance. Balance changes only when you post an adjustment.
      </p>
      <div className="form-grid">
        <label>Tank
          <select value={tankId} onChange={(e) => setTankId(Number(e.target.value))}>
            <option value={0}>Select…</option>
            {tanks.map((t) => <option key={t.id} value={t.id}>{t.tank_code} — {t.name}</option>)}
          </select>
        </label>
        <label>Physical measurement (L)
          <input type="number" value={measured} onChange={(e) => setMeasured(e.target.value)} />
        </label>
        <label>Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {LOSS_REASON_CODES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>

      {preview && (
        <div className="detail-grid" style={{ marginTop: '1rem' }}>
          <div><strong>System calculated</strong><br />{preview.calculatedVolumeLitres.toFixed(2)} L @ {preview.calculatedAbv.toFixed(2)}%</div>
          <div><strong>Physical</strong><br />{preview.measuredVolumeLitres.toFixed(2)} L</div>
          <div><strong>Variance</strong><br />{preview.varianceLitres.toFixed(2)} L</div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      <div className="toolbar" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" disabled={!tankId || !measured} onClick={handlePost}>
          Post Reconciliation
        </button>
      </div>

      <h3 style={{ marginTop: '2rem' }}>Reconciliation History</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Tank</th>
            <th>Calculated</th>
            <th>Measured</th>
            <th>Variance</th>
            <th>Adjustment Tx</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 && <tr><td colSpan={6} className="empty-row">No reconciliations yet.</td></tr>}
          {history.map((r) => (
            <tr key={r.id}>
              <td>{r.created_at.slice(0, 16)}</td>
              <td>{r.tank_name}</td>
              <td>{r.calculated_volume_litres.toFixed(2)} L</td>
              <td>{r.measured_volume_litres.toFixed(2)} L</td>
              <td>{r.variance_litres.toFixed(2)} L</td>
              <td>{r.adjustment_transaction_id ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
