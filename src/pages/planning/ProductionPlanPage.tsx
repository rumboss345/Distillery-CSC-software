import { planningRepository } from '../../db/repositories/planning-repository';

export function ProductionPlanPage() {
  const plans = planningRepository.listProductionPlans();

  return (
    <section className="card">
      <h2>Production Plans</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Horizon</th>
            <th>Status</th>
            <th>Lines</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <td>{p.plan_code}</td>
              <td>{p.name}</td>
              <td>{p.plan_start.slice(0, 10)} – {p.plan_end.slice(0, 10)}</td>
              <td>{p.status}</td>
              <td>{planningRepository.getProductionPlanLines(p.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {plans.length === 0 && <p>No production plans yet.</p>}
    </section>
  );
}
