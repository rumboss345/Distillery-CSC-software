import { Link } from 'react-router-dom';
import type { KpiComparison, OwnerKpiSnapshot } from '../lib/reporting/owner-kpis';
import { formatKpiDelta } from '../lib/reporting/owner-kpis';

function KpiStat({
  label,
  value,
  comparison,
  sub,
  testId,
  href,
}: {
  label: string;
  value: string;
  comparison?: KpiComparison;
  sub?: string;
  testId?: string;
  href?: string;
}) {
  const delta = comparison ? formatKpiDelta(comparison) : null;
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta && <div className="sub">{delta}</div>}
      {sub && <div className="sub">{sub}</div>}
    </>
  );
  if (href) {
    return (
      <Link to={href} className="stat-card owner-kpi-stat owner-kpi-stat-link" data-testid={testId}>
        {body}
      </Link>
    );
  }
  return (
    <div className="stat-card owner-kpi-stat" data-testid={testId}>
      {body}
    </div>
  );
}

export function OwnerKpiPanel({
  kpis,
  periodLabel,
}: {
  kpis: OwnerKpiSnapshot;
  periodLabel: string;
}) {
  const compareHint = kpis.priorPeriodLabel
    ? `Period metrics compare to ${kpis.priorPeriodLabel}.`
    : 'Choose a dated period to see comparisons.';

  return (
    <section className="card owner-kpi-panel" data-testid="owner-kpi-panel">
      <header className="owner-kpi-header">
        <div>
          <h3 className="section-title" style={{ marginTop: 0 }}>Owner KPIs</h3>
          <p className="report-section-desc" style={{ margin: 0 }}>
            Live floor snapshot plus production for <strong>{periodLabel}</strong>. {compareHint}
          </p>
        </div>
      </header>
      <div className="card-grid owner-kpi-grid">
        <KpiStat
          label="Spirit on hand (LAA)"
          value={`${kpis.spiritOnHandLaa.toFixed(1)} gal`}
          sub={`${kpis.holdingTanksWithSpirit} tank${kpis.holdingTanksWithSpirit === 1 ? '' : 's'} with liquid`}
          testId="owner-kpi-spirit-on-hand"
          href="/reports/tanks"
        />
        <KpiStat
          label="Active fermentations"
          value={String(kpis.activeFermentations)}
          sub={`${kpis.washesInProgress} wash${kpis.washesInProgress === 1 ? '' : 'es'} in progress`}
          testId="owner-kpi-fermentations"
          href="/fermentation"
        />
        <KpiStat
          label="Distillation in progress"
          value={String(kpis.distillationActive)}
          testId="owner-kpi-distillation"
          href="/distillation"
        />
        <KpiStat
          label="Barrels aging"
          value={String(kpis.barrelsAging)}
          testId="owner-kpi-barrels"
        />
        <KpiStat
          label="Overdue fermentations"
          value={String(kpis.overdueFermentations)}
          sub={kpis.overdueFermentations > 0 ? 'Past expected completion' : 'On schedule'}
          testId="owner-kpi-overdue"
          href="/fermentation"
        />
        <KpiStat
          label="Low stock items"
          value={String(kpis.lowStockItems)}
          testId="owner-kpi-low-stock"
          href="/inventory"
        />
      </div>
      <h4 className="owner-kpi-subheading">Production in period</h4>
      <div className="card-grid owner-kpi-grid">
        <KpiStat
          label="Hearts collected"
          value={`${kpis.heartsGal.current.toFixed(1)} gal`}
          comparison={kpis.heartsGal}
          testId="owner-kpi-hearts"
        />
        <KpiStat
          label="GPA produced"
          value={`${kpis.gpaProduced.current.toFixed(1)} gal`}
          comparison={kpis.gpaProduced}
          testId="owner-kpi-gpa"
        />
        <KpiStat
          label="Bottles filled"
          value={kpis.bottlesFilled.current.toLocaleString()}
          comparison={kpis.bottlesFilled}
          testId="owner-kpi-bottles"
        />
        <KpiStat
          label="Completed still runs"
          value={String(kpis.completedRuns.current)}
          comparison={kpis.completedRuns}
          testId="owner-kpi-runs"
        />
        <KpiStat
          label="Exceptions"
          value={String(kpis.exceptions.current)}
          comparison={kpis.exceptions}
          sub="Operational flags in period"
          testId="owner-kpi-exceptions"
          href="/reports/exceptions"
        />
      </div>
    </section>
  );
}
