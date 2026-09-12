import { useEffect, useState } from 'react';
import { MWO_STATUSES, MWO_WORK_TYPES } from '../../../shared/maintenance/constants';
import { maintenanceRepository } from '../../db/repositories/maintenance-repository';
import type { EquipmentMaintenanceProfile, MaintWorkOrder } from '../../types/maintenance';

export function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<MaintWorkOrder[]>([]);
  const [equipment, setEquipment] = useState<EquipmentMaintenanceProfile[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [workType, setWorkType] = useState<(typeof MWO_WORK_TYPES)[number]>('Preventive');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');

  const refresh = () => {
    setWorkOrders(maintenanceRepository.listWorkOrders());
    setEquipment(maintenanceRepository.listEquipmentMaintenanceProfiles());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = () => {
    if (!equipmentId || !title.trim()) return;
    maintenanceRepository.createWorkOrder({
      floorEquipmentId: Number(equipmentId),
      workType,
      title: title.trim(),
      scheduledDate: scheduledDate || null,
      status: scheduledDate ? 'Scheduled' : 'Open',
    });
    setTitle('');
    setScheduledDate('');
    refresh();
  };

  const handleComplete = (id: number) => {
    maintenanceRepository.completeWorkOrder(id);
    refresh();
  };

  const handleCancel = (id: number) => {
    maintenanceRepository.updateWorkOrderStatus(id, 'Cancelled');
    refresh();
  };

  return (
    <section className="card">
      <h2>Maintenance Work Orders</h2>
      <div className="form-row">
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          <option value="">Select equipment</option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select value={workType} onChange={(e) => setWorkType(e.target.value as typeof workType)}>
          {MWO_WORK_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={handleCreate}>Create MWO</button>
        <button type="button" className="btn" onClick={() => { maintenanceRepository.generateDuePmWorkOrders(); refresh(); }}>
          Generate Due PM
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Equipment</th>
            <th>Type</th>
            <th>Title</th>
            <th>Status</th>
            <th>Scheduled</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {workOrders.map((wo) => (
            <tr key={wo.id}>
              <td>{wo.work_order_code}</td>
              <td>{wo.equipment_name}</td>
              <td>{wo.work_type}</td>
              <td>{wo.title}</td>
              <td>{wo.status}</td>
              <td>{wo.scheduled_date ?? '—'}</td>
              <td>
                {MWO_STATUSES.includes(wo.status) && wo.status !== 'Completed' && wo.status !== 'Cancelled' && (
                  <>
                    <button type="button" className="btn btn-sm" onClick={() => handleComplete(wo.id)}>Complete</button>
                    {' '}
                    <button type="button" className="btn btn-sm" onClick={() => handleCancel(wo.id)}>Cancel</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
