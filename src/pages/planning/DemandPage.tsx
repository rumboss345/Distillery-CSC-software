import { planningRepository } from '../../db/repositories/planning-repository';

export function DemandPage() {
  const forecasts = planningRepository.listDemandForecasts();

  return (
    <section className="card">
      <h2>Demand Forecasts</h2>
      <p className="text-muted">Forecasted SKU demand by period. Recommendations only — no inventory changes.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Period</th>
            <th>Status</th>
            <th>Lines</th>
          </tr>
        </thead>
        <tbody>
          {forecasts.map((f) => (
            <tr key={f.id}>
              <td>{f.forecast_code}</td>
              <td>{f.name}</td>
              <td>{f.period_start.slice(0, 10)} – {f.period_end.slice(0, 10)}</td>
              <td>{f.status}</td>
              <td>{planningRepository.getDemandForecastLines(f.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {forecasts.length === 0 && <p>No demand forecasts yet.</p>}
    </section>
  );
}
