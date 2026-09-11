import { useEffect, useState } from 'react';
import { EQUIPMENT_CRITICALITIES, EQUIPMENT_MAINT_STATUSES } from '../../../shared/maintenance/constants';
import type { EquipmentCriticality, EquipmentMaintStatus } from '../../../shared/maintenance/constants';
import { maintenanceRepository } from '../../db/repositories/maintenance-repository';
import type { EquipmentMaintenanceProfile } from '../../types/maintenance';

export function EquipmentPage() {
  const [equipment, setEquipment] = useState<EquipmentMaintenanceProfile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    assetNumber: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    commissionDate: '',
    criticality: 'Medium',
    maintStatus: 'Active',
    serviceProvider: '',
    lastCalibrationDate: '',
    nextCalibrationDue: '',
    calibrationCertificateRef: '',
  });

  const refresh = () => setEquipment(maintenanceRepository.listEquipmentMaintenanceProfiles());

  useEffect(() => {
    refresh();
  }, []);

  const loadForm = (item: EquipmentMaintenanceProfile) => {
    setSelectedId(item.id);
    setForm({
      assetNumber: item.asset_number ?? '',
      manufacturer: item.manufacturer ?? '',
      model: item.model ?? '',
      serialNumber: item.serial_number ?? '',
      commissionDate: item.commission_date ?? '',
      criticality: item.criticality ?? 'Medium',
      maintStatus: item.maint_status ?? 'Active',
      serviceProvider: item.service_provider ?? '',
      lastCalibrationDate: item.last_calibration_date ?? '',
      nextCalibrationDue: item.next_calibration_due ?? '',
      calibrationCertificateRef: item.calibration_certificate_ref ?? '',
    });
  };

  const handleSave = () => {
    if (selectedId == null) return;
    maintenanceRepository.updateEquipmentMaintenance({
      equipmentId: selectedId,
      assetNumber: form.assetNumber || null,
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      serialNumber: form.serialNumber || null,
      commissionDate: form.commissionDate || null,
      criticality: form.criticality as EquipmentCriticality,
      maintStatus: form.maintStatus as EquipmentMaintStatus,
      serviceProvider: form.serviceProvider || null,
      lastCalibrationDate: form.lastCalibrationDate || null,
      nextCalibrationDue: form.nextCalibrationDue || null,
      calibrationCertificateRef: form.calibrationCertificateRef || null,
    });
    refresh();
  };

  return (
    <>
      <section className="card">
        <h2>Floor Equipment Registry</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Asset #</th>
              <th>Criticality</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.equipment_type}</td>
                <td>{item.asset_number ?? '—'}</td>
                <td>{item.criticality ?? '—'}</td>
                <td>{item.maint_status ?? 'Active'}</td>
                <td>
                  <button type="button" className="btn btn-sm" onClick={() => loadForm(item)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selectedId != null && (
        <section className="card">
          <h2>Equipment Metadata</h2>
          <div className="form-grid">
            <label>
              Asset Number
              <input value={form.assetNumber} onChange={(e) => setForm({ ...form, assetNumber: e.target.value })} />
            </label>
            <label>
              Manufacturer
              <input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            </label>
            <label>
              Model
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </label>
            <label>
              Serial Number
              <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
            </label>
            <label>
              Commission Date
              <input type="date" value={form.commissionDate} onChange={(e) => setForm({ ...form, commissionDate: e.target.value })} />
            </label>
            <label>
              Criticality
              <select value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value })}>
                {EQUIPMENT_CRITICALITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Maintenance Status
              <select value={form.maintStatus} onChange={(e) => setForm({ ...form, maintStatus: e.target.value })}>
                {EQUIPMENT_MAINT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Service Provider
              <input value={form.serviceProvider} onChange={(e) => setForm({ ...form, serviceProvider: e.target.value })} />
            </label>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSave}>Save Metadata</button>
        </section>
      )}
    </>
  );
}
