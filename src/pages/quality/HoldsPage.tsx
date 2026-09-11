import { useEffect, useState } from 'react';
import { qualityRepository } from '../../db/repositories/quality-repository';
import type { QcHold } from '../../types/quality';

export function HoldsPage() {
  const [holds, setHolds] = useState<QcHold[]>([]);
  const [entityType, setEntityType] = useState<'mat_lot' | 'liq_lot' | 'fg_lot'>('mat_lot');
  const [entityId, setEntityId] = useState('1');
  const [reason, setReason] = useState('');

  const refresh = () => setHolds(qualityRepository.listHolds());

  useEffect(() => {
    refresh();
  }, []);

  const handlePlaceHold = () => {
    if (!reason.trim()) return;
    qualityRepository.placeHold({
      entityType,
      entityId: Number(entityId),
      reason: reason.trim(),
    });
    setReason('');
    refresh();
  };

  const handleRelease = (holdId: number) => {
    qualityRepository.releaseHold({ holdId, releaseNotes: 'Released from QA/QC holds page' });
    refresh();
  };

  return (
    <section className="card">
      <h2>Quality Holds</h2>
      <p className="text-muted">Active holds block production issue, blending, and FG shipment.</p>
      <div className="form-row">
        <select value={entityType} onChange={(e) => setEntityType(e.target.value as typeof entityType)}>
          <option value="mat_lot">Material Lot</option>
          <option value="liq_lot">Liquid Lot</option>
          <option value="fg_lot">FG Lot</option>
        </select>
        <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="Entity ID" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hold reason" />
        <button type="button" className="btn btn-primary" onClick={handlePlaceHold}>Place Hold</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Entity</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Placed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {holds.map((h) => (
            <tr key={h.id}>
              <td>{h.hold_code}</td>
              <td>{h.entity_type} #{h.entity_id}</td>
              <td>{h.reason}</td>
              <td>{h.status}</td>
              <td>{h.placed_at.slice(0, 10)}</td>
              <td>
                {h.status === 'Active' && (
                  <button type="button" className="btn btn-sm" onClick={() => handleRelease(h.id)}>Release</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
