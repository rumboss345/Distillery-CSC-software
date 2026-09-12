import { useEffect, useState } from 'react';
import { PM_FREQUENCY_UNITS } from '../../../shared/maintenance/constants';
import { maintenanceRepository } from '../../db/repositories/maintenance-repository';
import type { EquipmentMaintenanceProfile, MaintPmSchedule } from '../../types/maintenance';

export function PmSchedulesPage() {
  const [schedules, setSchedules] = useState<MaintPmSchedule[]>([]);
  const [equipment, setEquipment] = useState<EquipmentMaintenanceProfile[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [name, setName] = useState('');
  const [frequencyValue, setFrequencyValue] = useState('30');
  const [frequencyUnit, setFrequencyUnit] = useState<(typeof PM_FREQUENCY_UNITS)[number]>('days');
  const [nextDueDate, setNextDueDate] = useState('');

  const refresh = () => {
    setSchedules(maintenanceRepository.listPmSchedules());
    setEquipment(maintenanceRepository.listEquipmentMaintenanceProfiles());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = () => {
    if (!equipmentId || !name.trim()) return;
    maintenanceRepository.createPmSchedule({
      floorEquipmentId: Number(equipmentId),
      name: name.trim(),
      frequencyValue: Number(frequencyValue),
      frequencyUnit,
      nextDueDate: nextDueDate || null,
    });
    setName('');
    refresh();
  };

  return (
    <section className="card">
      <h2>Preventive Maintenance Schedules</h2>
      <div className="form-row">
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          <option value="">Select equipment</option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Schedule name" />
        <input value={frequencyValue} onChange={(e) => setFrequencyValue(e.target.value)} placeholder="Every" />
        <select value={frequencyUnit} onChange={(e) => setFrequencyUnit(e.target.value as typeof frequencyUnit)}>
          {PM_FREQUENCY_UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={handleCreate}>Add Schedule</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Equipment</th>
            <th>Name</th>
            <th>Frequency</th>
            <th>Last Done</th>
            <th>Next Due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => (
            <tr key={s.id}>
              <td>{s.schedule_code}</td>
              <td>{s.equipment_name}</td>
              <td>{s.name}</td>
              <td>{s.frequency_value} {s.frequency_unit}</td>
              <td>{s.last_completed_date ?? '—'}</td>
              <td>{s.next_due_date ?? '—'}</td>
              <td>{s.due_status ?? 'Current'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
