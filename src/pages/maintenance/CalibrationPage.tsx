import { useEffect, useState } from 'react';
import { maintenanceRepository } from '../../db/repositories/maintenance-repository';
import type { EquipmentCalibrationStatus, EquipmentMaintenanceProfile } from '../../types/maintenance';

export function CalibrationPage() {
  const [calibrations, setCalibrations] = useState<EquipmentCalibrationStatus[]>([]);
  const [equipment, setEquipment] = useState<EquipmentMaintenanceProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [lastDate, setLastDate] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [certRef, setCertRef] = useState('');

  const refresh = () => {
    setCalibrations(maintenanceRepository.listCalibrationStatuses());
    setEquipment(maintenanceRepository.listEquipmentMaintenanceProfiles());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = () => {
    if (!selectedId) return;
    maintenanceRepository.updateEquipmentMaintenance({
      equipmentId: Number(selectedId),
      lastCalibrationDate: lastDate || null,
      nextCalibrationDue: nextDue || null,
      calibrationCertificateRef: certRef || null,
    });
    refresh();
  };

  return (
    <>
      <section className="card">
        <h2>Calibration Tracking</h2>
        <div className="form-row">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select equipment</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} placeholder="Last calibration" />
          <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} placeholder="Next due" />
          <input value={certRef} onChange={(e) => setCertRef(e.target.value)} placeholder="Certificate ref" />
          <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </section>
      <section className="card">
        <h2>Calibration Status</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Last Calibration</th>
              <th>Next Due</th>
              <th>Certificate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {calibrations.map((c) => (
              <tr key={c.equipmentId}>
                <td>{c.equipmentName}</td>
                <td>{c.lastCalibrationDate ?? '—'}</td>
                <td>{c.nextCalibrationDue ?? '—'}</td>
                <td>{c.calibrationCertificateRef ?? '—'}</td>
                <td>{c.dueStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
