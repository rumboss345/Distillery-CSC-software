import { qualityRepository } from '../../db/repositories/quality-repository';

export function QualityDashboardPage() {
  const summary = qualityRepository.getQualityDashboardSummary();

  return (
    <section className="card">
      <h2>Quality Overview</h2>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Active Specifications</span>
          <span className="stat-value">{summary.activeSpecs}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Holds</span>
          <span className="stat-value">{summary.activeHolds}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending Samples</span>
          <span className="stat-value">{summary.pendingSamples}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Complete Samples</span>
          <span className="stat-value">{summary.completeSamples}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Issued COAs</span>
          <span className="stat-value">{summary.issuedCoas}</span>
        </div>
      </div>
      <p className="text-muted">
        Holds block production issue, blending, and FG shipment. Use Recall Trace to follow supplier lots forward or FG lots backward.
      </p>
    </section>
  );
}
