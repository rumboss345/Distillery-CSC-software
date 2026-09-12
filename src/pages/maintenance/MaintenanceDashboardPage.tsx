import { maintenanceRepository } from '../../db/repositories/maintenance-repository';

export function MaintenanceDashboardPage() {
  const summary = maintenanceRepository.getMaintenanceDashboardSummary();
  const dueItems = maintenanceRepository.listDuePmSchedules();

  return (
    <>
      <section className="card">
        <h2>Maintenance Overview</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Floor Equipment</span>
            <span className="stat-value">{summary.totalEquipment}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Open Work Orders</span>
            <span className="stat-value">{summary.openWorkOrders}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Overdue PM</span>
            <span className="stat-value">{summary.overduePmSchedules}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Downtime</span>
            <span className="stat-value">{summary.activeDowntime}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Overdue Calibrations</span>
            <span className="stat-value">{summary.overdueCalibrations}</span>
          </div>
        </div>
      </section>
      <section className="card">
        <h2>Due PM Schedules</h2>
        {dueItems.length === 0 ? (
          <p className="text-muted">No PM schedules due or overdue.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Schedule</th>
                <th>Next Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dueItems.map(({ schedule, dueStatus }) => (
                <tr key={schedule.id}>
                  <td>{schedule.equipment_name}</td>
                  <td>{schedule.name}</td>
                  <td>{schedule.next_due_date}</td>
                  <td>{dueStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
