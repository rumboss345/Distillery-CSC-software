import { planningRepository } from '../../db/repositories/planning-repository';

export function PlanningDashboardPage() {
  const summary = planningRepository.getPlanningDashboardSummary();
  const conflicts = planningRepository.listScheduleConflicts();

  return (
    <>
      <section className="card">
        <h2>Planning Overview</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Active Forecasts</span>
            <span className="stat-value">{summary.activeForecasts}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Open Plans</span>
            <span className="stat-value">{summary.openPlans}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">MRP Runs (30d)</span>
            <span className="stat-value">{summary.recentMrpRuns}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Material Shortages</span>
            <span className="stat-value">{summary.totalShortages}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Schedule Conflicts</span>
            <span className="stat-value">{summary.scheduleConflicts}</span>
          </div>
        </div>
      </section>
      {conflicts.length > 0 && (
        <section className="card">
          <h2>Resource Conflicts</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Equipment ID</th>
                <th>Slot A</th>
                <th>Slot B</th>
                <th>Overlap</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={`${c.slotAId}-${c.slotBId}`}>
                  <td>{c.floorEquipmentId}</td>
                  <td>{c.slotAId}</td>
                  <td>{c.slotBId}</td>
                  <td>{c.overlapStart.slice(0, 16)} – {c.overlapEnd.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
