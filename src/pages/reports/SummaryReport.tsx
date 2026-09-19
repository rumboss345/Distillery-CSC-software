import { format, parseISO } from 'date-fns';
import {
  getYieldReports,
  getProductionSummary,
  getEquipmentVolumeReport,
  getMashBatches,
  getDistillationRuns,
  getBarrels,
  getBottlingRuns,
} from '../../db/queries';
import { StatusBadge } from '../../components/StatusBadge';
import { equipmentTypeLabel } from '../../lib/equipment';
import { totalVolumeGal } from '../../lib/bottling-lines';
import { queryAll } from '../../db/database';
import { eventInReportRange } from '../../lib/reporting/period';
import { useReportContext } from './report-context';

export function SummaryReport() {
  const { range } = useReportContext();

  const monthParam =
    range.from?.slice(0, 7) === range.to?.slice(0, 7) && range.from
      ? range.from.slice(0, 7)
      : undefined;

  const yieldsAll = getYieldReports(monthParam);
  const runs = getDistillationRuns();
  const mashes = getMashBatches();
  const mashIdsInRange = new Set(
    runs
      .filter((r) => eventInReportRange(r.run_date, range) && r.source_mash_batch_id)
      .map((r) => r.source_mash_batch_id as number),
  );
  const mashBatchNumbersInRange = new Set(
    mashes.filter((m) => mashIdsInRange.has(m.id)).map((m) => m.batch_number),
  );
  const yields = monthParam
    ? yieldsAll
    : yieldsAll.filter((y) => mashBatchNumbersInRange.has(y.mashBatchNumber));

  const summary = getProductionSummary(monthParam);
  const equipmentReport = getEquipmentVolumeReport();
  const barrels = getBarrels();
  const bottlings = getBottlingRuns();

  const filteredMashes = mashes.filter((m) => eventInReportRange(m.start_date, range));
  const filteredRuns = runs.filter((r) => eventInReportRange(r.run_date, range));
  const filteredBarrels = barrels.filter((b) => eventInReportRange(b.fill_date, range));
  const filteredBottlings = bottlings.filter((b) => eventInReportRange(b.bottling_date, range));

  const completedMashes = filteredMashes.filter((m) => m.status === 'complete').length;
  const completedRuns = filteredRuns.filter((r) => r.status === 'complete').length;
  const avgYield = yields.length > 0
    ? yields.reduce((s, y) => s + y.yieldPercent, 0) / yields.length
    : 0;
  const totalGpa = yields.reduce((s, y) => s + y.gpa, 0);
  const totalGrain = yields.reduce((s, y) => s + y.grainLbs, 0);

  const totalHeartsGal = monthParam
    ? summary.totalHeartsGal
    : queryHeartsInRange(filteredRuns.map((r) => r.id));

  const bottlesInRange = monthParam
    ? summary.bottlesThisMonth
    : filteredBottlings.reduce(
      (s, b) => s + (b.lines.reduce((n, l) => n + l.bottle_count, 0) || b.bottle_count),
      0,
    );

  return (
    <>
      <div className="card-grid">
        <div className="stat-card">
          <div className="label">Completed Washes</div>
          <div className="value">{completedMashes}</div>
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
        <div className="stat-card">
          <div className="label">Total Sugar Processed</div>
          <div className="value">{totalGrain.toFixed(0)} lbs</div>
        </div>
        <div className="stat-card">
          <div className="label">Barrels / Bottlings</div>
          <div className="value">{filteredBarrels.length} / {filteredBottlings.length}</div>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Equipment & Current Volumes</h3>
        <p className="report-section-desc">
          Live snapshot of floor equipment (always current — not filtered by report period).
        </p>
        {equipmentReport.length === 0 ? (
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
                  <th>Capacity</th>
                  <th>Current Volume</th>
                  <th>ABV</th>
                  <th>Contents</th>
                </tr>
              </thead>
              <tbody>
                {equipmentReport.map((eq) => (
                  <tr key={eq.id}>
                    <td><strong>{eq.name}</strong></td>
                    <td>{equipmentTypeLabel(eq.equipment_type)}</td>
                    <td><StatusBadge status={eq.status} /></td>
                    <td>{eq.capacity_gal > 0 ? `${eq.capacity_gal} gal` : '—'}</td>
                    <td>
                      {eq.volume_gal > 0 ? (
                        <strong>{eq.volume_gal.toFixed(1)} gal</strong>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Empty</span>
                      )}
                    </td>
                    <td>{eq.abv != null ? `${eq.abv.toFixed(1)}%` : '—'}</td>
                    <td>{eq.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Yield by Wash Batch</h3>
        <p className="report-section-desc">
          GPA = Gallons of Pure Alcohol. Yield % = GPA ÷ sugar (lbs) × 100.
        </p>
        {yields.length === 0 ? (
          <div className="empty-state">
            <p>No yield data for this period. Record distillation hearts cuts or widen the date range.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wash Batch</th>
                  <th>Sugar (lbs)</th>
                  <th>Wash (gal)</th>
                  <th>Hearts (gal)</th>
                  <th>Hearts ABV</th>
                  <th>GPA</th>
                  <th>Yield %</th>
                </tr>
              </thead>
              <tbody>
                {yields.map((y) => (
                  <tr key={y.mashBatchNumber}>
                    <td><strong>{y.mashBatchNumber}</strong></td>
                    <td>{y.grainLbs}</td>
                    <td>{y.washVolumeGal}</td>
                    <td>{y.heartsVolumeGal.toFixed(1)}</td>
                    <td>{y.heartsAbv.toFixed(1)}%</td>
                    <td>{y.gpa.toFixed(2)} gal</td>
                    <td><strong>{y.yieldPercent.toFixed(1)}%</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Bottling</h3>
        <p className="report-section-desc">
          Tank bottling empties the source tank on save. Variance is bottled volume minus tank draw.
        </p>
        {filteredBottlings.length === 0 ? (
          <div className="empty-state">
            <p>No bottling runs for this period.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Product</th>
                  <th>Date</th>
                  <th>Bottled (gal)</th>
                  <th>Tank draw (gal)</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {filteredBottlings.map((run) => {
                  const bottled = run.bottled_volume_gal ?? totalVolumeGal(run.lines);
                  const variance = run.volume_variance_gal;
                  return (
                    <tr key={run.id}>
                      <td><strong>{run.batch_number}</strong></td>
                      <td>{run.product_name}</td>
                      <td>{format(parseISO(run.bottling_date), 'MMM d, yyyy')}</td>
                      <td>{bottled.toFixed(2)}</td>
                      <td>
                        {run.source_holding_tank_equipment_id && run.source_volume_gal != null
                          ? run.source_volume_gal.toFixed(2)
                          : '—'}
                      </td>
                      <td>
                        {variance != null && Math.abs(variance) >= 0.01
                          ? `${variance > 0 ? '+' : ''}${variance.toFixed(2)}`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Production Pipeline Summary</h3>
        <div className="card report-pipeline-summary">
          <div>Wash Batches:     {filteredMashes.length} started{monthParam ? '' : ` (${summary.activeMashes} active)`}</div>
          <div>Distillation:     {filteredRuns.length} runs{monthParam ? '' : ` (${summary.activeRuns} active)`}</div>
          <div>Barrels Filled:   {filteredBarrels.length}{monthParam ? '' : ` (${summary.barrelsAging} aging total)`}</div>
          <div>Hearts Collected: {totalHeartsGal.toFixed(1)} gal</div>
          <div>Bottled:          {bottlesInRange} bottles</div>
          <div>Low Stock Items:  {summary.lowStockItems} (current)</div>
        </div>
      </div>
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
