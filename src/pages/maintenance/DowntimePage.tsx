import { useEffect, useState } from 'react';
import { DOWNTIME_PRODUCTION_IMPACTS } from '../../../shared/maintenance/constants';
import { maintenanceRepository } from '../../db/repositories/maintenance-repository';
import type { EquipmentMaintenanceProfile, MaintDowntimeRecord } from '../../types/maintenance';

export function DowntimePage() {
  const [records, setRecords] = useState<MaintDowntimeRecord[]>([]);
  const [equipment, setEquipment] = useState<EquipmentMaintenanceProfile[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [reason, setReason] = useState('');
  const [productionImpact, setProductionImpact] = useState<(typeof DOWNTIME_PRODUCTION_IMPACTS)[number]>('None');

  const refresh = () => {
    setRecords(maintenanceRepository.listDowntimeRecords());
    setEquipment(maintenanceRepository.listEquipmentMaintenanceProfiles());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = () => {
    if (!equipmentId || !reason.trim() || !startedAt) return;
    maintenanceRepository.createDowntimeRecord({
      floorEquipmentId: Number(equipmentId),
      startedAt: new Date(startedAt).toISOString(),
      reason: reason.trim(),
      productionImpact,
    });
    setReason('');
    refresh();
  };

  const handleEnd = (id: number) => {
    maintenanceRepository.endDowntimeRecord(id);
    refresh();
  };

  return (
    <section className="card">
      <h2>Equipment Downtime</h2>
      <div className="form-row">
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          <option value="">Select equipment</option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        <select value={productionImpact} onChange={(e) => setProductionImpact(e.target.value as typeof productionImpact)}>
          {DOWNTIME_PRODUCTION_IMPACTS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <button type="button" className="btn btn-primary" onClick={handleCreate}>Record Downtime</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Equipment</th>
            <th>Started</th>
            <th>Ended</th>
            <th>Hours</th>
            <th>Impact</th>
            <th>Reason</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td>{r.downtime_code}</td>
              <td>{r.equipment_name}</td>
              <td>{r.started_at.slice(0, 16).replace('T', ' ')}</td>
              <td>{r.ended_at ? r.ended_at.slice(0, 16).replace('T', ' ') : 'Active'}</td>
              <td>{r.duration_hours ?? '—'}</td>
              <td>{r.production_impact}</td>
              <td>{r.reason}</td>
              <td>
                {!r.ended_at && (
                  <button type="button" className="btn btn-sm" onClick={() => handleEnd(r.id)}>End</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
