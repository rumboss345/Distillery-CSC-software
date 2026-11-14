import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  getProductionSummary,
  getMashBatches,
  getDistillationRuns,
  getBarrels,
  barrelBlendProductName,
  getAllMashFermenterAssignments,
  getDashboardThresholds,
  useRefreshKey,
} from '../db/queries';
import { StatusBadge } from '../components/StatusBadge';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { NeedsAttentionPanel } from '../components/dashboard/NeedsAttentionPanel';
import { SevenDaySchedulePanel, TodayProductionPanel } from '../components/dashboard/SchedulePanels';
import { TankStatusPanel } from '../components/dashboard/TankStatusPanel';
import { VariancePanel } from '../components/dashboard/VariancePanel';
import { ReconciliationPanel } from '../components/dashboard/ReconciliationPanel';
import { DashboardCharts } from '../components/dashboard/DashboardCharts';
import { useDisplayUnit } from '../components/dashboard/useDisplayUnit';
import { useAuth } from '../context/AuthContext';
import { formatDateDisplay } from '../lib/date-input';
import { fermentationDaysOverdue, formatDaysOverdue, listOverdueFermentations } from '../lib/fermentation';
import { localIsoDate } from '../lib/planned-event-date';
import { PROCESS_STAGE_LABELS } from '../lib/permissions';
import { dashboardViewForRole, type DashboardView } from '../lib/roles';
import { attentionForUser } from '../lib/dashboard/attention';
import {
  buildSevenDaySchedule,
  filterScheduleDays,
  summarizeTodayJobs,
} from '../lib/dashboard/schedule';
import {
  loadAlcoholReconciliation,
  loadDashboardCharts,
  loadNeedsAttention,
  loadScheduleEvents,
  loadTankStatus,
  loadVariance,
} from '../lib/dashboard/load';
import { resolveReportPeriod, type ReportPeriodPreset } from '../lib/reporting/period';
import {
  DISPLAY_VOLUME_UNITS,
  formatVolumeInUnit,
  type DisplayVolumeUnit,
} from '../lib/reporting/alcohol-units';

const PERIOD_OPTIONS: { value: ReportPeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
];

const VIEW_SUBTITLES: Record<DashboardView, string> = {
  owner: 'Business overview: what needs attention, production, alcohol accounts and trends',
  manager: 'Production overview: what needs attention, today’s work, tanks and variances',
  operator: 'Your work today, the next seven days and the tanks you look after',
};

function VarianceSection({ preset, unit }: { preset: ReportPeriodPreset; unit: DisplayVolumeUnit }) {
  const range = resolveReportPeriod(preset);
  const variance = loadVariance(range);
  const thresholds = getDashboardThresholds();
  return (
    <VariancePanel
      blends={variance.blends}
      bottlings={variance.bottlings}
      unit={unit}
      thresholds={thresholds}
      periodLabel={range.label}
    />
  );
}

function ReconciliationSection({ preset, today }: { preset: ReportPeriodPreset; today: string }) {
  const range = resolveReportPeriod(preset);
  return <ReconciliationPanel reconciliation={loadAlcoholReconciliation(range, today)} periodLabel={range.label} />;
}

function ChartsSection({ preset, unit, today }: { preset: ReportPeriodPreset; unit: DisplayVolumeUnit; today: string }) {
  const range = resolveReportPeriod(preset);
  const charts = loadDashboardCharts(range, today);
  return (
    <DashboardCharts
      production={charts.production}
      bottling={charts.bottlingByProduct}
      yieldPoints={charts.yield}
      unit={unit}
      today={today}
      periodLabel={range.label}
    />
  );
}

export function Dashboard() {
  const { user, hasPermission, hasProcessAssignment } = useAuth();
  const { key: sharedKey } = useRefreshKey();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [preset, setPreset] = useState<ReportPeriodPreset>('month');
  const [unit, setUnit] = useDisplayUnit();

  const view = dashboardViewForRole(user?.role);
  const isOperator = view === 'operator';
  const operatorName = isOperator ? (user?.name?.trim() || user?.email || null) : null;

  const month = format(new Date(), 'yyyy-MM');
  const summary = getProductionSummary(month, month);
  const today = localIsoDate();
  const mashes = getMashBatches();
  const recentMashes = mashes.slice(0, 3);
  const overdueFermentations = listOverdueFermentations(getAllMashFermenterAssignments(), mashes, today);
  const recentRuns = getDistillationRuns().slice(0, 3);
  const agingBarrels = getBarrels().filter((b) => b.status === 'aging').slice(0, 3);

  const attention = useMemo(
    () => attentionForUser(loadNeedsAttention(new Date(), today), hasPermission),
    [sharedKey, today, hasPermission],
  );

  const scheduleDays = useMemo(
    () => filterScheduleDays(buildSevenDaySchedule(loadScheduleEvents(), today), hasPermission, operatorName),
    [sharedKey, today, hasPermission, operatorName],
  );
  const todayWork = summarizeTodayJobs(scheduleDays[0]?.jobs ?? []);

  const tankRows = useMemo(() => {
    const rows = loadTankStatus();
    return isOperator ? rows.filter((row) => hasProcessAssignment(row.stage)) : rows;
  }, [sharedKey, isOperator, hasProcessAssignment]);

  const periodLabel = resolveReportPeriod(preset).label;

  const statCards = (
    <div className="card-grid dash-stat-grid">
      <div className="stat-card">
        <div className="label">Active Fermentations</div>
        <div className="value accent">{summary.activeFermentations}</div>
        <div className="sub">
          One per fermenter
          {overdueFermentations.length > 0 && (
            <span className="stat-card-alert" data-testid="dashboard-overdue-count">
              {' '}· {overdueFermentations.length} overdue
            </span>
          )}
        </div>
      </div>
      <div className="stat-card">
        <div className="label">Distillation Runs</div>
        <div className="value">{summary.activeRuns}</div>
        <div className="sub">Planned or running</div>
      </div>
      <div className="stat-card">
        <div className="label">Barrels Aging</div>
        <div className="value">{summary.barrelsAging}</div>
        <div className="sub">In warehouse</div>
      </div>
      <div className="stat-card">
        <div className="label">Total Hearts</div>
        <div className="value">{formatVolumeInUnit(summary.totalHeartsGal, unit)}</div>
        <div className="sub">Hearts cuts from runs this month</div>
      </div>
      <div className="stat-card" data-testid="dashboard-bottled-month">
        <div className="label">Bottled This Month</div>
        {summary.bottlesBySize.length === 0 ? (
          <>
            <div className="value">0</div>
            <div className="sub">No bottles this month</div>
          </>
        ) : (
          <div className="dashboard-bottle-sizes" data-testid="dashboard-bottle-sizes">
            {summary.bottlesBySize.map((size) => (
              <div key={size.sizeMl} data-testid={`dashboard-bottle-size-${size.sizeMl}`}>
                {size.count.toLocaleString()} × {size.sizeMl} ml
              </div>
            ))}
          </div>
        )}
      </div>
      <Link to="/inventory" className="stat-card stat-card-link">
        <div className="label">Low Stock Alerts</div>
        <div className={`value${summary.lowStockItems > 0 ? ' accent' : ''}`}>
          {summary.lowStockItems}
        </div>
        <div className="sub">Items at or below reorder level</div>
      </Link>
    </div>
  );

  return (
    <div data-shared-refresh={sharedKey} className="dashboard" data-testid={`dashboard-view-${view}`}>
      <div className="page-header dash-header">
        <div>
          <h2>Production Dashboard</h2>
          <p>{VIEW_SUBTITLES[view]}</p>
        </div>
        <div className="dash-controls">
          {!isOperator && (
            <label className="dash-inline-select">
              Period
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as ReportPeriodPreset)}
                data-testid="dashboard-period"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="dash-inline-select">
            Volumes in
            <select
              value={unit}
              onChange={(event) => setUnit(event.target.value as DisplayVolumeUnit)}
              data-testid="dashboard-unit"
            >
              {DISPLAY_VOLUME_UNITS.map((option) => (
                <option key={option.id} value={option.id}>{option.label} ({option.short})</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {mounted && user && isOperator && user.processAssignments.length > 0 && (
        <div className="card dash-assignments">
          <h3 className="section-title">My process assignments</h3>
          <ul>
            {user.processAssignments.map((key) => (
              <li key={key}>{PROCESS_STAGE_LABELS[key]}</li>
            ))}
          </ul>
        </div>
      )}

      {!isOperator && statCards}

      <div className="dash-top-grid">
        <NeedsAttentionPanel items={attention} />
        <TodayProductionPanel today={todayWork} title={isOperator ? 'My work today' : "Today's production"} />
      </div>

      <CollapsibleSection
        title="Next 7 days"
        summary={`${scheduleDays.reduce((sum, day) => sum + day.jobs.length, 0)} jobs`}
        storageKey={`dashboard-schedule-${view}`}
        className="dash-collapsible"
      >
        <SevenDaySchedulePanel days={scheduleDays} />
      </CollapsibleSection>

      <CollapsibleSection
        title={isOperator ? 'My tanks & equipment' : 'Tanks & equipment'}
        summary={`${tankRows.length} vessels`}
        storageKey={`dashboard-tanks-${view}`}
        className="dash-collapsible"
      >
        <TankStatusPanel rows={tankRows} unit={unit} title={isOperator ? 'My tanks & equipment' : 'Tanks & equipment'} />
      </CollapsibleSection>

      {!isOperator && (
        <>
          <CollapsibleSection
            title="Blending & bottling variance"
            summary={periodLabel}
            storageKey={`dashboard-variance-${view}`}
            className="dash-collapsible"
          >
            <VarianceSection preset={preset} unit={unit} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Alcohol reconciliation"
            summary={`${periodLabel} · litres pure alcohol`}
            defaultOpen={view === 'owner'}
            storageKey={`dashboard-reconciliation-${view}`}
            className="dash-collapsible"
          >
            <ReconciliationSection preset={preset} today={today} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Trends"
            summary="Production, bottling, yield and inventory"
            defaultOpen={view === 'owner'}
            storageKey={`dashboard-charts-${view}`}
            className="dash-collapsible"
          >
            <ChartsSection preset={preset} unit={unit} today={today} />
          </CollapsibleSection>
        </>
      )}

      {overdueFermentations.length > 0 && hasPermission('wash') && (
        <div className="section" data-testid="dashboard-overdue-fermentations">
          <h3 className="section-title">Overdue Fermentations</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wash batch</th>
                  <th>Fermenter</th>
                  <th>Expected done</th>
                  <th>Overdue</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {overdueFermentations.map((row) => (
                  <tr key={`${row.batchId}-${row.equipmentId}`} className="row-overdue">
                    <td><strong>{row.batchNumber}</strong></td>
                    <td>{row.equipmentName}</td>
                    <td>{formatDateDisplay(row.expectedCompletionDate)}</td>
                    <td><span className="badge badge-overdue">{formatDaysOverdue(row.daysOverdue)}</span></td>
                    <td className="td-actions">
                      <Link className="btn btn-sm btn-secondary" to={`/fermentation?logsEquipment=${row.equipmentId}`}>
                        Logs
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CollapsibleSection
        title="Recent records"
        summary="Wash batches, distillation runs, barrels"
        defaultOpen={false}
        storageKey={`dashboard-recent-${view}`}
        className="dash-collapsible"
      >
        <div className="section">
          <h3 className="section-title">Recent Wash Batches</h3>
          {recentMashes.length === 0 ? (
            <div className="empty-state">No wash batches yet</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Recipe</th>
                    <th className="num">Sugar (lbs)</th>
                    <th>Started</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMashes.map((m) => {
                    const daysOverdue = fermentationDaysOverdue(m.status, m.expected_completion_date, today);
                    return (
                      <tr key={m.id} className={daysOverdue > 0 ? 'row-overdue' : undefined}>
                        <td><strong>{m.batch_number}</strong></td>
                        <td>{m.recipe_name}</td>
                        <td className="num">{m.grain_lbs} lbs · {m.grain_type}</td>
                        <td>{formatDateDisplay(m.start_date)}</td>
                        <td>
                          <StatusBadge status={m.status} />
                          {daysOverdue > 0 && <> <span className="badge badge-overdue">{formatDaysOverdue(daysOverdue)}</span></>}
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
          <h3 className="section-title">Recent Distillation Runs</h3>
          {recentRuns.length === 0 ? (
            <div className="empty-state">No distillation runs yet</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Still</th>
                    <th>Date</th>
                    <th className="num">Charge</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.batch_number}</strong></td>
                      <td>{r.still_name}</td>
                      <td>{formatDateDisplay(r.run_date)}</td>
                      <td className="num">{formatVolumeInUnit(r.charge_volume_gal, unit)}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {agingBarrels.length > 0 && (
          <div className="section">
            <h3 className="section-title">Barrels in Aging</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Barrel</th>
                    <th>Spirit</th>
                    <th>Fill Date</th>
                    <th className="num">Volume</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {agingBarrels.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{b.barrel_number}</strong></td>
                      <td>{barrelBlendProductName(b.id) || b.spirit_type} @ {b.initial_abv}%</td>
                      <td>{formatDateDisplay(b.fill_date)}</td>
                      <td className="num">{formatVolumeInUnit(b.current_volume_gal, unit)}</td>
                      <td>{b.warehouse_location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
