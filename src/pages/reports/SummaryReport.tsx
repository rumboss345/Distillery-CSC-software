import { formatDateDisplay } from '../../lib/date-input';
import {
  getProductionSummary,
  getEquipmentVolumeReport,
  getMashBatches,
  getDistillationRuns,
  getBarrels,
  getBottlingRuns,
} from '../../db/queries';
import { StatusBadge } from '../../components/StatusBadge';
import { equipmentTypeLabel } from '../../lib/equipment';
import { bottlingSentToTankGal, formatBottleSizes, formatBottlingAlcoholVariance, reportedBottlingAlcoholVarianceGal, reportedBottlingVarianceGal, totalVolumeGal } from '../../lib/bottling-lines';
import { queryAll } from '../../db/database';
import { eventInReportRange, fullCalendarMonthKey } from '../../lib/reporting/period';
import {
  distillationRunIdsInRange,
  heartsGalInReportRange,
  yieldReportsForDistillationRunIds,
} from '../../lib/reporting/distillation-in-range';
import { filterRowsByPerson, reportPersonMatches } from '../../lib/reporting/person';
import {
  buildVolumeChangeRows,
  formatGpaAfterLossOrGainNote,
  formatVolumeVarianceAbv,
  gpaAfterLossOrGain,
  totalVolumeVarianceAbv,
  totalVolumeVarianceGal,
} from '../../lib/reporting/volume-changes';
import { formatTankVolumeVariance } from '../../lib/tank-volume-variance';
import { sugarUses, totalSugarProcessedLbs } from '../../lib/reporting/sugar-processed';
import { formatAbvEstimate } from '../../lib/fermentation';
import { buildFermentationPerformance } from '../../lib/reporting/fermentation-performance';
import { buildPackagingConsumption } from '../../lib/reporting/packaging-consumption';
import { OwnerKpiPanel } from '../../components/OwnerKpiPanel';
import { ReportRecordLink } from '../../components/ReportRecordLink';
import { buildOwnerKpis } from '../../lib/reporting/owner-kpis';
import { useReportContext } from './report-context';
import { ProductivityChart } from './ProductivityChart';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { useMemo } from 'react';

export function SummaryReport() {
  const { range, employee } = useReportContext();

  const monthParam = fullCalendarMonthKey(range);

  const runs = getDistillationRuns();
  const mashes = getMashBatches();
  const filteredRuns = runs.filter((r) => (
    eventInReportRange(r.run_date, range)
    && reportPersonMatches(r.assigned_user_name, employee, r.assigned_user_id)
  ));
  const runIdsForYields = employee
    ? filteredRuns.map((r) => r.id)
    : distillationRunIdsInRange(range);
  const yields = yieldReportsForDistillationRunIds(runIdsForYields);

  const summary = getProductionSummary(monthParam ?? undefined);
  const equipmentReport = getEquipmentVolumeReport();
  const equipmentWithLiquid = equipmentReport.filter((eq) => eq.volume_gal > 0).length;
  const barrels = getBarrels();
  const bottlings = getBottlingRuns();

  const filteredMashes = mashes.filter((m) => (
    eventInReportRange(m.start_date, range)
    && reportPersonMatches(m.assigned_user_name, employee, m.assigned_user_id)
  ));
  const filteredBarrels = employee
    ? []
    : barrels.filter((b) => eventInReportRange(b.fill_date, range));
  const filteredBottlings = bottlings.filter((b) => (
    eventInReportRange(b.bottling_date, range)
    && reportPersonMatches(b.variance_changed_by, employee)
  ));

  const completedMashes = filteredMashes.filter((m) => m.status === 'complete').length;
  const volumeChanges = filterRowsByPerson(buildVolumeChangeRows(range), (row) => row.who, employee);
  const volumeVarianceGal = totalVolumeVarianceGal(volumeChanges);
  const volumeVarianceAbv = totalVolumeVarianceAbv(volumeChanges);
  const completedRuns = filteredRuns.filter((r) => r.status === 'complete').length;
  const avgYield = yields.length > 0
    ? yields.reduce((s, y) => s + y.yieldPercent, 0) / yields.length
    : 0;
  const totalGpa = yields.reduce((s, y) => s + y.gpa, 0);
  const gpaAfterChange = gpaAfterLossOrGain(totalGpa, volumeChanges);
  const totalSugarProcessed = totalSugarProcessedLbs(
    sugarUses().filter((use) => reportPersonMatches(use.operator, employee, use.operatorId)),
    range,
  );

  const totalHeartsGal = monthParam && !employee
    ? summary.totalHeartsGal
    : employee
      ? queryHeartsInRange(filteredRuns.map((r) => r.id))
      : heartsGalInReportRange(range);

  const bottlesInRange = monthParam && !employee
    ? summary.bottlesThisMonth
    : filteredBottlings.reduce(
      (s, b) => s + (b.lines.reduce((n, l) => n + l.bottle_count, 0) || b.bottle_count),
      0,
    );

  const fermentationPerformance = useMemo(() => {
    const perf = buildFermentationPerformance(range);
    const rows = filterRowsByPerson(perf.rows, (row) => row.operator, employee);
    const finished = rows.filter((row) => row.duration_days != null && row.status !== 'fermenting');
    const avgDuration = finished.length > 0
      ? finished.reduce((sum, row) => sum + (row.duration_days ?? 0), 0) / finished.length
      : null;
    const withBrix = rows.filter((row) => row.start_brix != null && row.finish_brix != null);
    const avgBrixDrop = withBrix.length > 0
      ? withBrix.reduce((sum, row) => sum + ((row.start_brix ?? 0) - (row.finish_brix ?? 0)), 0) / withBrix.length
      : null;
    return {
      rows,
      avg_duration_days: avgDuration != null ? Math.round(avgDuration * 10) / 10 : null,
      avg_brix_drop: avgBrixDrop != null ? Math.round(avgBrixDrop * 10) / 10 : null,
      overdue_count: rows.filter((row) => row.overdue_days > 0).length,
    };
  }, [range, employee]);

  const packagingConsumption = useMemo(
    () => buildPackagingConsumption(range, employee),
    [range, employee],
  );

  const ownerKpis = useMemo(
    () => (employee ? null : buildOwnerKpis(range)),
    [range, employee],
  );

  return (
    <>
      {ownerKpis && <OwnerKpiPanel kpis={ownerKpis} periodLabel={range.label} />}
      {employee && (
        <p className="field-hint" data-testid="owner-kpi-filter-hint" style={{ marginTop: 0 }}>
          Owner KPIs show when Employee is set to All employees.
        </p>
      )}

      <div className="card-grid">
        <div className="stat-card">
          <div className="label">Completed Washes</div>
          <div className="value">{completedMashes}</div>
        </div>
        <div className="stat-card" data-testid="summary-volume-variance">
          <div className="label">Volume variances</div>
          <div className="value">{formatTankVolumeVariance(volumeVarianceGal)}</div>
          <div className="sub" data-testid="summary-volume-variance-abv">{formatVolumeVarianceAbv(volumeVarianceAbv)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Completed Runs</div>
          <div className="value">{completedRuns}</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg Yield (GPA/lb)</div>
          <div className="value accent">{avgYield.toFixed(1)}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Total GPA Produced</div>
          <div className="value">{totalGpa.toFixed(1)} gal</div>
        </div>
        <div className="stat-card" data-testid="summary-gpa-after-loss">
          <div className="label">GPA after loss or gain</div>
          <div className="value">{gpaAfterChange.toFixed(1)} gal</div>
          <div className="sub" data-testid="summary-gpa-after-loss-note">{formatGpaAfterLossOrGainNote(volumeChanges)}</div>
        </div>
        <div className="stat-card" data-testid="total-sugar-processed">
          <div className="label">Total Sugar Processed</div>
          <div className="value">{totalSugarProcessed.toFixed(0)} lbs</div>
          <div className="sub">Sugar used to make washes</div>
        </div>
        <div className="stat-card">
          <div className="label">Barrels / Bottlings</div>
          <div className="value">{employee ? '—' : filteredBarrels.length} / {filteredBottlings.length}</div>
          {employee && <div className="sub">Barrel fills are stored without an employee</div>}
        </div>
      </div>

      <ProductivityChart />

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Fermentation performance"
        summary={
          fermentationPerformance.rows.length === 0
            ? 'No fermentations'
            : `${fermentationPerformance.rows.length} in period · ${fermentationPerformance.overdue_count} overdue`
        }
        storageKey="report-summary-ferment-performance"
      >
        <p className="report-section-desc">
          Fermentations that finished or were charged in this period. Duration is from the day the wash moved into fermenters until distillation or the end of the report period. Overdue uses each wash&apos;s expected completion date.
        </p>
        {fermentationPerformance.rows.length === 0 ? (
          <div className="empty-state">
            <p>{employee ? `No fermentations for ${employee.label} in this period.` : 'No fermentations in this period.'}</p>
          </div>
        ) : (
          <>
            <div className="card-grid" style={{ marginBottom: '1rem' }}>
              <div className="stat-card">
                <div className="label">Avg ferment days</div>
                <div className="value">{fermentationPerformance.avg_duration_days ?? '—'}</div>
              </div>
              <div className="stat-card">
                <div className="label">Avg Brix drop</div>
                <div className="value">{fermentationPerformance.avg_brix_drop ?? '—'}</div>
              </div>
              <div className="stat-card">
                <div className="label">Overdue in period</div>
                <div className="value">{fermentationPerformance.overdue_count}</div>
              </div>
            </div>
            <div className="table-wrap">
              <table data-testid="fermentation-performance-table">
                <thead>
                  <tr>
                    <th>Wash batch</th>
                    <th>Fermenter</th>
                    <th className="num">Days</th>
                    <th className="num">Start Brix</th>
                    <th className="num">Finish Brix</th>
                    <th className="num">Alc %</th>
                    <th>Status</th>
                    <th className="num">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {fermentationPerformance.rows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <ReportRecordLink
                          target={{
                            kind: 'fermentation_logs',
                            id: row.mash_id,
                            equipmentId: row.fermenter_equipment_id ?? undefined,
                          }}
                        >
                          <strong>{row.batch_number}</strong>
                        </ReportRecordLink>
                      </td>
                      <td>{row.fermenter_name}</td>
                      <td className="num">{row.duration_days ?? '—'}</td>
                      <td className="num">{row.start_brix ?? '—'}</td>
                      <td className="num">{row.finish_brix ?? '—'}</td>
                      <td className="num">{formatAbvEstimate(row.alcohol_pct)}</td>
                      <td>{row.status}</td>
                      <td className="num">{row.overdue_days > 0 ? `${row.overdue_days}d` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Packaging consumption"
        summary={packagingConsumption.length}
        defaultOpen={false}
        storageKey="report-summary-packaging"
      >
        <p className="report-section-desc">
          Bottles and labels counted on finished bottling runs in this period (packaging inventory SKUs).
        </p>
        {packagingConsumption.length === 0 ? (
          <div className="empty-state">
            <p>{employee ? `No packaging use recorded by ${employee.label} in this period.` : 'No packaging use in this period.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table data-testid="packaging-consumption-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Inventory SKU</th>
                  <th className="num">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {packagingConsumption.map((row) => (
                  <tr key={row.key}>
                    <td>{row.kind === 'bottle' ? 'Bottle' : 'Label'}</td>
                    <td>{row.sku}</td>
                    <td className="num">{row.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Equipment & Current Volumes"
        summary={employee ? 'Shared floor' : `${equipmentWithLiquid} holding liquid`}
        defaultOpen={false}
        storageKey="report-summary-equipment"
      >
        <p className="report-section-desc">
          {employee
            ? `Choose All employees to see the live floor. Tank levels are shared across the distillery.`
            : 'Live snapshot of floor equipment (always current — not filtered by report period).'}
        </p>
        {employee ? null : equipmentReport.length === 0 ? (
          <div className="empty-state">
            <p>No floor equipment configured. Add equipment on the Floor Plan page.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="num">Capacity</th>
                  <th className="num">Current Volume</th>
                  <th className="num">ABV</th>
                  <th>Contents</th>
                </tr>
              </thead>
              <tbody>
                {equipmentReport.map((eq) => (
                  <tr key={eq.id}>
                    <td><strong>{eq.name}</strong></td>
                    <td>{equipmentTypeLabel(eq.equipment_type)}</td>
                    <td><StatusBadge status={eq.status} /></td>
                    <td className="num">{eq.capacity_gal > 0 ? `${eq.capacity_gal} gal` : '—'}</td>
                    <td className="num">
                      {eq.volume_gal > 0 ? (
                        <strong>{eq.volume_gal.toFixed(1)} gal</strong>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Empty</span>
                      )}
                    </td>
                    <td className="num">{eq.abv != null ? `${eq.abv.toFixed(1)}%` : '—'}</td>
                    <td>{eq.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Yield by Wash Batch"
        summary={yields.length}
        storageKey="report-summary-yield"
      >
        <p className="report-section-desc">
          GPA = Gallons of Pure Alcohol. Yield % = GPA ÷ sugar (lbs) × 100.
        </p>
        {yields.length === 0 ? (
          <div className="empty-state">
            <p>
              {employee
                ? `No yield data for ${employee.label} in this period. Record distillation hearts cuts or widen the date range.`
                : 'No yield data for this period. Record distillation hearts cuts or widen the date range.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wash Batch</th>
                  <th className="num">Sugar (lbs)</th>
                  <th className="num">Wash (gal)</th>
                  <th className="num">Hearts (gal)</th>
                  <th className="num">Hearts ABV</th>
                  <th className="num">GPA</th>
                  <th className="num">Yield %</th>
                </tr>
              </thead>
              <tbody>
                {yields.map((y) => (
                  <tr key={y.mashBatchNumber}>
                    <td><strong>{y.mashBatchNumber}</strong></td>
                    <td className="num">{y.grainLbs}</td>
                    <td className="num">{y.washVolumeGal}</td>
                    <td className="num">{y.heartsVolumeGal.toFixed(1)}</td>
                    <td className="num">{y.heartsAbv.toFixed(1)}%</td>
                    <td className="num">{y.gpa.toFixed(2)} gal</td>
                    <td className="num"><strong>{y.yieldPercent.toFixed(1)}%</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Bottling"
        summary={filteredBottlings.length}
        storageKey="report-summary-bottling"
      >
        <p className="report-section-desc">
          Tank bottling empties the source tank on save. Gallons sent to a tank are not a loss. Variance is bottled gallons plus gallons sent to tanks, minus the tank draw. Alcohol gained or lost compares the pure alcohol bottled and returned with the pure alcohol drawn.
        </p>
        {filteredBottlings.length === 0 ? (
          <div className="empty-state">
            <p>{employee ? `No bottling runs for ${employee.label} in this period.` : 'No bottling runs for this period.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Product</th>
                  <th>Date</th>
                  <th className="num">Bottled (gal)</th>
                  <th>Bottle sizes</th>
                  <th className="num">To tank (gal)</th>
                  <th className="num">Tank draw (gal)</th>
                  <th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {filteredBottlings.map((run) => {
                  const bottled = run.bottled_volume_gal ?? totalVolumeGal(run.lines);
                  const sentGal = bottlingSentToTankGal(run);
                  const variance = reportedBottlingVarianceGal(run);
                  const alcoholVariance = reportedBottlingAlcoholVarianceGal(run);
                  return (
                    <tr key={run.id}>
                      <td>
                        <ReportRecordLink target={{ kind: 'bottling', id: run.id }}>
                          <strong>{run.batch_number}</strong>
                        </ReportRecordLink>
                      </td>
                      <td>{run.product_name}</td>
                      <td>{formatDateDisplay(run.bottling_date)}</td>
                      <td className="num">{bottled.toFixed(2)}</td>
                      <td>{formatBottleSizes(run.lines)}</td>
                      <td className="num">{sentGal >= 0.01 ? sentGal.toFixed(2) : '—'}</td>
                      <td className="num">
                        {run.source_holding_tank_equipment_id && run.source_volume_gal != null
                          ? run.source_volume_gal.toFixed(2)
                          : '—'}
                      </td>
                      <td className="num">
                        <div>
                          {variance != null && Math.abs(variance) >= 0.01
                            ? `${variance > 0 ? '+' : ''}${variance.toFixed(2)}`
                            : '—'}
                        </div>
                        {alcoholVariance != null && Math.abs(alcoholVariance) >= 0.01 && (
                          <div>{formatBottlingAlcoholVariance(alcoholVariance)}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Production Pipeline Summary"
        storageKey="report-summary-pipeline"
      >
        <div className="card report-pipeline-summary">
          <div>Wash Batches:     {filteredMashes.length} started{monthParam || employee ? '' : ` (${summary.activeMashes} active)`}</div>
          <div>Distillation:     {filteredRuns.length} runs{monthParam || employee ? '' : ` (${summary.activeRuns} active)`}</div>
          <div>Barrels Filled:   {employee ? 'barrel fills are stored without an employee' : `${filteredBarrels.length}${monthParam ? '' : ` (${summary.barrelsAging} aging total)`}`}</div>
          <div>Hearts Collected: {totalHeartsGal.toFixed(1)} gal</div>
          <div>Bottled:          {bottlesInRange} bottles</div>
          <div>Low Stock Items:  {summary.lowStockItems} (current)</div>
        </div>
      </CollapsibleSection>
    </>
  );
}

function queryHeartsInRange(runIds: number[]): number {
  if (runIds.length === 0) return 0;
  const placeholders = runIds.map(() => '?').join(',');
  const row = queryAll<{ total: number }>(
    `SELECT COALESCE(SUM(volume_gal), 0) as total FROM distillation_cuts
     WHERE cut_type = 'hearts' AND distillation_run_id IN (${placeholders})`,
    runIds,
  );
  return row[0]?.total ?? 0;
}
