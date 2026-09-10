import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  getYieldReports,
  getProductionSummary,
  getEquipmentVolumeReport,
  getMashBatches,
  getDistillationRuns,
  getBarrels,
  getBottlingRuns,
} from '../db/queries';
import { StatusBadge } from '../components/StatusBadge';
import { equipmentTypeLabel } from '../lib/equipment';

function inReportMonth(dateStr: string, reportMonth: string): boolean {
  return dateStr.slice(0, 7) === reportMonth;
}

export function Reports() {
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const monthParam = reportMonth || undefined;
  const yields = getYieldReports(monthParam);
  const summary = getProductionSummary(monthParam);
  const equipmentReport = getEquipmentVolumeReport();
  const mashes = getMashBatches();
  const runs = getDistillationRuns();
  const barrels = getBarrels();
  const bottlings = getBottlingRuns();

  const filteredMashes = reportMonth
    ? mashes.filter((m) => inReportMonth(m.start_date, reportMonth))
    : mashes;
  const filteredRuns = reportMonth
    ? runs.filter((r) => inReportMonth(r.run_date, reportMonth))
    : runs;
  const filteredBarrels = reportMonth
    ? barrels.filter((b) => inReportMonth(b.fill_date, reportMonth))
    : barrels;
  const filteredBottlings = reportMonth
    ? bottlings.filter((b) => inReportMonth(b.bottling_date, reportMonth))
    : bottlings;

  const completedMashes = filteredMashes.filter((m) => m.status === 'complete').length;
  const completedRuns = filteredRuns.filter((r) => r.status === 'complete').length;
  const avgYield = yields.length > 0
    ? yields.reduce((s, y) => s + y.yieldPercent, 0) / yields.length
    : 0;

  const totalGpa = yields.reduce((s, y) => s + y.gpa, 0);
  const totalGrain = yields.reduce((s, y) => s + y.grainLbs, 0);

  const periodLabel = reportMonth
    ? format(parseISO(`${reportMonth}-01`), 'MMMM yyyy')
    : 'All time';

  return (
    <div>
      <div className="page-header">
        <h2>Production Reports</h2>
        <p>Yield analysis and production metrics</p>
        <div className="page-actions report-filters">
          <div className="form-group report-month-filter">
            <label htmlFor="report-month">Report period</label>
            <div className="report-month-controls">
              <input
                id="report-month"
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setReportMonth(new Date().toISOString().slice(0, 7))}
              >
                This month
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setReportMonth('')}
              >
                All time
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="report-period-banner">
        Showing production data for <strong>{periodLabel}</strong>
      </p>

      <div className="card-grid">
        <div className="stat-card">
          <div className="label">Completed Mashes</div>
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
          <div className="label">Total Grain Processed</div>
          <div className="value">{totalGrain.toFixed(0)} lbs</div>
        </div>
        <div className="stat-card">
          <div className="label">Barrels / Bottlings</div>
          <div className="value">{filteredBarrels.length} / {filteredBottlings.length}</div>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Equipment & Current Volumes</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
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
        <h3 className="section-title">Yield by Mash Batch — {periodLabel}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          GPA = Gallons of Pure Alcohol. Yield % = GPA ÷ grain (lbs) × 100.
          {reportMonth ? ' Includes mashes distilled during this month.' : ''}
        </p>
        {yields.length === 0 ? (
          <div className="empty-state">
            <p>No yield data for {periodLabel.toLowerCase()}. Try another month or record distillation hearts cuts.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mash Batch</th>
                  <th>Grain (lbs)</th>
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
        <h3 className="section-title">Production Pipeline Summary — {periodLabel}</h3>
        <div className="card" style={{ fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 2 }}>
          <div>Mash Batches:     {filteredMashes.length} started{reportMonth ? '' : ` (${summary.activeMashes} active)`}</div>
          <div>Distillation:     {filteredRuns.length} runs{reportMonth ? '' : ` (${summary.activeRuns} active)`}</div>
          <div>Barrels Filled:   {filteredBarrels.length}{reportMonth ? '' : ` (${summary.barrelsAging} aging total)`}</div>
          <div>Hearts Collected: {summary.totalHeartsGal.toFixed(1)} gal</div>
          <div>Bottled:          {summary.bottlesThisMonth} bottles</div>
          <div>Low Stock Items:  {summary.lowStockItems} (current)</div>
        </div>
      </div>
    </div>
  );
}
