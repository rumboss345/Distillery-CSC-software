import { Link } from 'react-router-dom';
import type { AlcoholReconciliation } from '../../lib/dashboard/reconciliation';
import { LITERS_PER_US_GALLON } from '../../lib/reporting/alcohol-units';

function liters(laaGal: number): string {
  return (laaGal * LITERS_PER_US_GALLON).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function gallons(laaGal: number): string {
  return laaGal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedLiters(laaGal: number): string {
  const value = laaGal * LITERS_PER_US_GALLON;
  return `${value > 0 ? '+' : ''}${value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

function differenceClass(laaGal: number | null): string {
  if (laaGal == null || Math.abs(laaGal) < 0.005) return '';
  return laaGal < 0 ? ' dash-loss' : ' dash-gain';
}

export function ReconciliationPanel({
  reconciliation,
  periodLabel,
}: {
  reconciliation: AlcoholReconciliation;
  periodLabel: string;
}) {
  const r = reconciliation;
  return (
    <section className="dash-panel" data-testid="dashboard-reconciliation" aria-labelledby="dash-recon-title">
      <header className="dash-panel-header">
        <h3 id="dash-recon-title" className="dash-panel-title">Alcohol reconciliation</h3>
        <span className="dash-panel-period">{periodLabel}</span>
      </header>
      <p className="dash-panel-note">
        Pure alcohol in litres (L pure alcohol) and US gallons, from recorded volume × ABV.
        ABVs are corrected to 60 °F when they are entered. Water adds volume but no alcohol, and spirit and water
        shrink when mixed, so volumes are never added up to find alcohol.
      </p>
      {!r.hasData ? (
        <p className="dash-empty">No distillation, transfers, proofing, blending, or bottling recorded in this period.</p>
      ) : (
        <>
          <div className="dash-recon-summary">
            <div className="dash-recon-figure">
              <span className="dash-recon-label">Opening in tanks</span>
              <span className="dash-recon-value">
                {r.openingTankLaaGal != null ? `${liters(r.openingTankLaaGal)} L` : '—'}
              </span>
            </div>
            <div className="dash-recon-figure">
              <span className="dash-recon-label">Net change</span>
              <span className={`dash-recon-value${differenceClass(r.tankNetChangeLaaGal)}`}>
                {signedLiters(r.tankNetChangeLaaGal)} L
              </span>
            </div>
            <div className="dash-recon-figure">
              <span className="dash-recon-label">Closing in tanks</span>
              <span className="dash-recon-value">
                {r.closingTankLaaGal != null ? `${liters(r.closingTankLaaGal)} L` : '—'}
              </span>
            </div>
            <div className="dash-recon-figure">
              <span className="dash-recon-label">Recorded gain / loss</span>
              <span className={`dash-recon-value${differenceClass(r.recordedDifferenceLaaGal)}`}>
                {signedLiters(r.recordedDifferenceLaaGal)} L
              </span>
            </div>
          </div>
          {r.closingTankLaaGal == null && (
            <p className="dash-panel-note">Opening and closing stock show only for periods that run through today.</p>
          )}
          <div className="table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="num">In (L)</th>
                  <th className="num">Out (L)</th>
                  <th className="num">Gain / loss (L)</th>
                  <th className="num">Gain / loss (US gal)</th>
                  <th>Records to check</th>
                </tr>
              </thead>
              <tbody>
                {r.stages.filter((stage) => stage.count > 0).map((stage) => (
                  <tr key={stage.key}>
                    <td>
                      <strong>{stage.label}</strong>
                      <div className="dash-cell-sub">{stage.note}</div>
                    </td>
                    <td className="num">{liters(stage.inLaaGal)}</td>
                    <td className="num">{liters(stage.outLaaGal)}</td>
                    <td className={`num${differenceClass(stage.differenceLaaGal)}`}>
                      {stage.differenceLaaGal != null ? signedLiters(stage.differenceLaaGal) : '—'}
                    </td>
                    <td className={`num${differenceClass(stage.differenceLaaGal)}`}>
                      {stage.differenceLaaGal != null ? `${stage.differenceLaaGal > 0 ? '+' : ''}${gallons(stage.differenceLaaGal)}` : '—'}
                    </td>
                    <td>
                      {stage.records.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <ul className="dash-recon-records">
                          {stage.records.map((record) => (
                            <li key={`${stage.key}-${record.href}-${record.label}`}>
                              <Link to={record.href}>{record.label}</Link>{' '}
                              <span className={differenceClass(record.differenceLaaGal)}>
                                {signedLiters(record.differenceLaaGal)} L
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.proofingWaterGal > 0 && (
            <p className="dash-panel-note">
              Proofing added {r.proofingWaterGal.toFixed(1)} US gal ({(r.proofingWaterGal * LITERS_PER_US_GALLON).toFixed(1)} L) of water.
              Mixing contraction: {r.proofingContractionGal.toFixed(2)} US gal of volume, which is not an alcohol loss.
            </p>
          )}
        </>
      )}
    </section>
  );
}
