import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { getProductionSummary, getMashBatches, getDistillationRuns, getBarrels, getInventoryItems, barrelBlendProductName, getAllMashFermenterAssignments } from '../db/queries';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { inventoryCategoryLabel } from '../lib/inventory-units';
import { formatDateDisplay } from '../lib/date-input';
import { fermentationDaysOverdue, formatDaysOverdue, listOverdueFermentations } from '../lib/fermentation';
import { localIsoDate } from '../lib/planned-event-date';
import { PROCESS_STAGE_LABELS } from '../lib/permissions';

export function Dashboard() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const summary = getProductionSummary(undefined, format(new Date(), 'yyyy-MM'));
  const today = localIsoDate();
  const mashes = getMashBatches();
  const recentMashes = mashes.slice(0, 3);
  const overdueFermentations = listOverdueFermentations(getAllMashFermenterAssignments(), mashes, today);
  const recentRuns = getDistillationRuns().slice(0, 3);
  const agingBarrels = getBarrels().filter((b) => b.status === 'aging').slice(0, 3);
  const lowStock = getInventoryItems().filter((i) => i.quantity <= i.reorder_level);

  return (
    <div>
      <div className="page-header">
        <h2>Production Dashboard</h2>
        <p>Overview of your distillery operations</p>
      </div>

      {mounted && user && user.role !== 'admin' && user.processAssignments.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>My process assignments</h3>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {user.processAssignments.map((key) => (
              <li key={key}>{PROCESS_STAGE_LABELS[key]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-grid">
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
          <div className="value">{summary.totalHeartsGal.toFixed(1)} gal</div>
          <div className="sub">Collected this month</div>
        </div>
        <div className="stat-card">
          <div className="label">Bottled This Month</div>
          <div className="value">{summary.bottlesThisMonth}</div>
          <div className="sub">Bottles filled</div>
        </div>
        <div className="stat-card">
          <div className="label">Low Stock Alerts</div>
          <div className={`value${summary.lowStockItems > 0 ? ' accent' : ''}`}>
            {summary.lowStockItems}
          </div>
          <div className="sub">Items at or below reorder level</div>
        </div>
      </div>

      {overdueFermentations.length > 0 && (
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
                    <td className="num">{r.charge_volume_gal} gal</td>
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
                    <td className="num">{b.current_volume_gal} gal</td>
                    <td>{b.warehouse_location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="section">
          <h3 className="section-title">Low Stock Warnings</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th className="num">On Hand</th>
                  <th className="num">Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong></td>
                    <td>{inventoryCategoryLabel(i.category)}</td>
                    <td className="low-stock num">{i.quantity} {i.unit}</td>
                    <td className="num">{i.reorder_level} {i.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
