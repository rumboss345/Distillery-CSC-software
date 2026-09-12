import { planningRepository } from '../../db/repositories/planning-repository';

export function MrpPage() {
  const runs = planningRepository.listMrpRuns();

  return (
    <section className="card">
      <h2>MRP Runs</h2>
      <p className="text-muted">Material requirements planning snapshots. Does not create purchase orders.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Date</th>
            <th>Plan ID</th>
            <th>Status</th>
            <th>Lines</th>
            <th>Shortages</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const lines = planningRepository.getMrpLines(run.id);
            const shortages = lines.filter((l) => l.shortage_quantity > 0).length;
            return (
              <tr key={run.id}>
                <td>{run.run_code}</td>
                <td>{run.run_date.slice(0, 10)}</td>
                <td>{run.production_plan_id ?? '—'}</td>
                <td>{run.status}</td>
                <td>{lines.length}</td>
                <td>{shortages}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {runs.length === 0 && <p>No MRP runs yet. Create a production plan and run MRP.</p>}
    </section>
  );
}
